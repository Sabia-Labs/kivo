import { Request, Response } from "express";
import { db } from "../db/client";
import { agentRoles, teamTypes, teamTypeRoles, capabilities, teamTypeCapabilities } from "../db/schema";
import { success } from "../lib/response";
import { eq } from "drizzle-orm";

export const getAgentRolesSync = async (_req: Request, res: Response) => {
  const roles = await db.select().from(agentRoles);
  res.json(success(roles));
};

export const getTeamTypesSync = async (_req: Request, res: Response) => {
  const types = await db.select().from(teamTypes);
  
  // Fetch roles for each team type to provide a complete "recipe"
  const typesWithRoles = await Promise.all(
    types.map(async (type) => {
      const roles = await db
        .select({
          roleId: teamTypeRoles.agentRoleId,
          quantity: teamTypeRoles.quantity,
          isLeader: teamTypeRoles.isLeader,
        })
        .from(teamTypeRoles)
        .where(eq(teamTypeRoles.teamTypeId, type.id));
      
      return { ...type, roles };
    })
  );

  res.json(success(typesWithRoles));
};

export const getCapabilitiesSync = async (req: Request, res: Response) => {
  const { teamTypeId } = req.query;

  if (teamTypeId) {
    // Return capabilities specifically linked to a team type
    const teamCapabilities = await db
      .select({
        capability: capabilities,
        isFavorite: teamTypeCapabilities.isFavorite,
        defaultAssignedRole: teamTypeCapabilities.defaultAssignedRole,
      })
      .from(teamTypeCapabilities)
      .innerJoin(capabilities, eq(teamTypeCapabilities.capabilityId, capabilities.id))
      .where(eq(teamTypeCapabilities.teamTypeId, String(teamTypeId)));

    return res.json(success(teamCapabilities));
  }

  // Otherwise return the global library
  const allCapabilities = await db.select().from(capabilities);
  res.json(success(allCapabilities));
};
