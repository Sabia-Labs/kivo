import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { plans, llmModels } from "../db/schema";
import { success } from "../lib/response";
import { eq } from "drizzle-orm";

export const plansRouter = Router();

plansRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allPlans = await db.select().from(plans);
    const allModels = await db.select().from(llmModels);

    const plansWithModels = allPlans.map(plan => ({
      ...plan,
      models: allModels.filter(m => m.tier === plan.tier)
    }));

    res.json(success(plansWithModels));
  } catch (err) {
    next(err);
  }
});
