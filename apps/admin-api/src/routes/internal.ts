import { Router } from "express";
import * as controller from "../controllers/internalTemplatesController";
import { failure } from "../lib/response";

const router = Router();

// Middleware de segurança simples
router.use((req, res, next) => {
  const token = req.headers["x-internal-token"];
  const secret = process.env.INTERNAL_SERVICE_TOKEN;

  if (!secret || token !== secret) {
    return res.status(401).json(failure("Unauthorized internal request"));
  }
  next();
});

router.get("/templates/agent-roles/sync", controller.getAgentRolesSync);
router.get("/templates/team-types/sync", controller.getTeamTypesSync);
router.get("/templates/capabilities/sync", controller.getCapabilitiesSync);

export { router as internalRouter };
