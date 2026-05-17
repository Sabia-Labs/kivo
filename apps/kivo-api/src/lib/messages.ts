export function buildTeamRequestInstructions(teamRequest: { title: string; identifier: string; requestDetails: string; responseContract: string; requesterName: string; }) {
  
  return `Instructions for handling this Team Request:

      **BASIC RULE**: You must only respond to this Team Request after completing all work. Use the 'update_request_status' Kivo MCP tool to update the status of the request to 'success' (or 'failed' if you cannot fulfill it) and provide your response.

      ### STEP 1: Fetch Request Details and start analysis
      If you haven't done so yet, please use the 'get_request' Kivo MCP tool to fetch the full details of this Team Request (${teamRequest.identifier}).
      Pay special attention to the original request from the user (field: requestDetails) and make sure to follow these instructions thoroughly to provide the best possible response and achieve the desired outcome of this request.
      Try to fetch the comments of that request using the 'get_comments' Kivo MCP tool. you might find important notes there too, as the request may have a previous history (it might be a case of a reopened request, for example).
      Make sure you understand the response_contract field for this request.  This field tells you what information you should provide in your response and what format you should use to provide it. 
      Check if there are any other requests linked to this request. You can use the 'list_related_requests' Kivo MCP tool to find them. This can help you get even better context. 
      If you find linked requests or tasks to the request, you SHOULD take a look at them to fully understand the context about what's being requested.

      ### STEP 2: Analyze Capabilities
      Look for the field 'suggestedCapabilities' in the request data. If there are capabilities associated to the Team Request you MUST:
      1. Iterate through them and look them up using the 'get_capability_by_identifier' Kivo MCP tool.
      2. For each capability, you MUST extract all descriptive fields.
      3. You MUST fully understand what each instruction is about.
      4. You MUST synthesize all information (capability instructions, input/output descriptions, and the request instructions).
      5. That will allow you to have a bigger picture and execute better the work being requested by this Team Request

      ### STEP 3: Evaluate, Accept or Reject
      Evaluate if you have enough information to execute this request based on its title, description, and synthesized instructions from the associated capabilities.
      - **Note**: There is no need to create a task for extremely simple requests: if the request is a simple question or something you can accomplish using your knowledge or available tools, ACCEPT IT and proceed to STEP 6.
      - **EXHAUST ALL OPTIONS BEFORE REJECTING**: You must make a strong effort to complete the request. Do NOT reject it immediately just because you feel information is missing. 
        You MUST first use all available tools (including MCP tools) to look up the missing information. 
      - IF YOU ABSOLUTELY CANNOT FULFILL IT (only after exhausting all tools): Reject the request using the 'update_request_status' tool (status: 'failed') and provide your reasoning in the 'response' field.
      - IF YOU ACCEPT THE REQUEST: Proceed to STEP 4.

      ### STEP 4: Create and Document TASK
      Use the 'create_task' Kivo MCP tool to document your unit of work. 
      You MUST pass the identifier of this request (${teamRequest.identifier}) in the 'requestId' parameter when creating the task to link them together.
      When creating the task, you MUST populate the structured fields:
      - **plan**: Describe how you plan to execute the work to fulfill the request. Include what you understood about the request, the instructions abstracted, and any inferences or deductions.
      - **taskList**: List the main steps you plan to take to execute the work (as a free-text or markdown to-do list).
      *(Note: 'executionLog' will be updated by you during STEP 5, and 'workSummary' will be populated when you finish).*
      - **CRITICAL RULE**: After creating the task, you MUST update the Team Request ${teamRequest.identifier} to indicate you are working on it. Call the 'update_request_status' tool and pass requestId: '${teamRequest.identifier}' AND status: 'in_progress'

      ### STEP 5: Execute Work
      Now, perform the actual work required to fulfill the request. Use whatever tools are necessary.
      Stay on this request until the work is completely finished. Do your best to fulfill the original request following the synthesized instructions.
      If you created a TASK in STEP 4, you SHOULD update the TASK's taskList and executionLog accordingly (using 'update_task') as you execute the work. 
      **CRITICAL RULE** during the execution of your work on this request you can never update any other task than the one you created in step 4.
      You must explain what you did using the 'update_task' tool to update the 'workSummary' field.
      You MUST also use the 'update_task' tool to populate the 'result' field with the deliverable or the final result of your work, regardless of its format: if its a deliverable in a different type or format or changes outside of Kivo API, you may reference it using 'url' or 'markdown' format, but always include the deliverable or the final result of your work.
      If your work requires opening new requests to request help or work from another agent of your team, you MUST link them to this request by passing the identifier of this request ('${teamRequest.identifier}') in the 'parentRequestId' parameter when using the 'create_request' Kivo MCP tool. 
      You SHOULD also update this request to indicate that you have opened a new request and that it is linked to this request.

      ### STEP 6: Finalize Request (Respond)
      1. Once all work is completely finished, you must call 'update_request_status' to update this request status to 'success' or 'failed'. 
      Pass the identifier '${teamRequest.identifier}' as the requestId.
      2. Provide your final response in the 'response' field:
         - If you created a TASK for this request, you may just refer to that task in your response.
         - Otherwise, if you didn't create a task (this may happen in case the work is too simple and you decided not to create a task), then in the 'response' field you MUST provide the final response.`;
}

export function buildTeamRequestMessage(teamRequest: { identifier: string; title: string }) {
  return `You received a new Team Request from your KIVO team with the identifier: ${teamRequest.identifier} and title: ${teamRequest.title}. 
  You must use the 'get_request' Kivo MCP tool passing the identifier '${teamRequest.identifier}' to fetch the details of this request.
  Read all fields without exception and follow the instructions thoroughly to provide the best possible response and achieve the desired outcome of this request.`;
}

export function buildTeamRequestFinishedMessage(completedRequest: { identifier: string; title: string; status: string; response?: string }) {
  return `A Team Request you previously opened has been completed.
  Identifier: ${completedRequest.identifier}
  Title: ${completedRequest.title}
  Status: ${completedRequest.status}
  
  You must use the 'get_request' Kivo MCP tool passing the identifier '${completedRequest.identifier}' to fetch the final details and response of this request if you need more context.
  
  Review the result of this request. Since this request was created as part of your work on another task/request, you must now continue your work based on these new findings or deliverables. 
  Update the original task or request you are working on, and proceed to the next steps of your plan.`;
}

/**
 * Replaces placeholders in agent soul, identity, and instructions.
 */
export function replacePlaceholders(
  text: string | null | undefined,
  vars: {
    agent_name?: string;
    team_name?: string;
    team_id?: string;
    operator_name?: string;
    mission?: string;
  }
): string {
  if (!text) return "";
  let result = text;

  if (vars.agent_name) {
    result = result.replace(/\{\{agent_name\}\}/g, vars.agent_name);
    result = result.replace(/\$\{AGENT_NAME\}/g, vars.agent_name);
  }
  if (vars.team_name) {
    result = result.replace(/\{\{team_name\}\}/g, vars.team_name);
    result = result.replace(/\$\{TEAM_NAME\}/g, vars.team_name);
  }
  if (vars.team_id) {
    result = result.replace(/\{\{team_id\}\}/g, vars.team_id);
    result = result.replace(/\$\{TEAM_ID\}/g, vars.team_id);
  }
  if (vars.operator_name) {
    result = result.replace(/\{\{operator_name\}\}/g, vars.operator_name);
    result = result.replace(/\$\{AGENT_OPERATOR_NAME\}/g, vars.operator_name);
  }
  if (vars.mission) {
    result = result.replace(/\{\{mission\}\}/g, vars.mission);
    result = result.replace(/\$\{MISSION\}/g, vars.mission);
  }
  return result;
}
