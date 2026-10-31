import { Router } from "express";
import mongoose, { type FilterQuery } from "mongoose";
import { getSettings } from "../config";
import { currentUser, getProjectForUser, requireUser } from "../lib/auth";
import { asyncHandler, escapeRegex, HttpError, isDuplicateKey, parseBody, parseId } from "../lib/http";
import { TaskIn, TaskQuery } from "../lib/schemas";
import { taskOut } from "../lib/serialize";
import { CreditLedger, Project, Task, Workspace, WorkspaceMember } from "../models";

export const tasksRouter = Router();

tasksRouter.get(
  "/api/projects/:projectId/tasks",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = currentUser(res.locals);
    const projectId = parseId(req.params.projectId, "Project");
    await getProjectForUser(projectId, user);
    const query = parseBody(TaskQuery, req.query);

    const filter: FilterQuery<unknown> = { project: projectId };
    if (query.q) filter.title = new RegExp(escapeRegex(query.q), "i");
    if (query.status) filter.status = query.status;

    const total = await Task.countDocuments(filter);
    const items = await Task.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .lean();
    res.json({ items: items.map(taskOut), total, page: query.page, page_size: query.page_size });
  })
);

/** Creating a task costs credits. */
tasksRouter.post(
  "/api/projects/:projectId/tasks",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = currentUser(res.locals);
    const projectId = parseId(req.params.projectId, "Project");
    const project = await getProjectForUser(projectId, user);
    const body = parseBody(TaskIn, req.body);
    const rawKey = req.headers["idempotency-key"] || req.headers["idempotency_key"];
    const key = (Array.isArray(rawKey) ? rawKey[0] : rawKey) as string | undefined;
    const cost = getSettings().TASK_CREDIT_COST;

    if (key) {
      const previous = await CreditLedger.findOne({ workspace: project.workspace, idempotencyKey: key }).lean();
      if (previous?.task) {
        const existingTask = await Task.findById(previous.task).lean();
        if (existingTask) {
          res.status(200).json(taskOut(existingTask));
          return;
        }
      }
    }

    if (body.assignee_id) {
      const isMember = await WorkspaceMember.exists({
        workspace: project.workspace,
        user: new mongoose.Types.ObjectId(body.assignee_id),
      });
      if (!isMember) throw new HttpError(422, "Assignee is not a workspace member");
    }

    const ws = await Workspace.findOneAndUpdate(
      { _id: project.workspace, credits: { $gte: cost } },
      { $inc: { credits: -cost } },
      { new: true }
    );
    if (!ws) {
      const exists = await Workspace.exists({ _id: project.workspace });
      if (!exists) throw new HttpError(404, "Workspace not found");
      throw new HttpError(402, "Not enough credits");
    }

    try {
      const task = await Task.create({
        project: projectId,
        title: body.title,
        status: body.status,
        createdBy: user._id,
        assignee: body.assignee_id,
      });

      await CreditLedger.create({
        workspace: ws._id,
        delta: -cost,
        reason: `task ${task._id}`,
        task: task._id,
        idempotencyKey: key ?? undefined,
      });

      res.status(201).json(taskOut(task));
    } catch (err) {
      await Workspace.findByIdAndUpdate(project.workspace, { $inc: { credits: cost } });
      if (isDuplicateKey(err) && key) {
        const previous = await CreditLedger.findOne({ workspace: project.workspace, idempotencyKey: key }).lean();
        if (previous?.task) {
          const existingTask = await Task.findById(previous.task).lean();
          if (existingTask) {
            res.status(200).json(taskOut(existingTask));
            return;
          }
        }
      }
      throw err;
    }
  })
);
