import type { NextFunction, Request, Response } from "express";
import { getPromptDefinition } from "../../ai/prompts/defaults";
import { PROMPT_INVALID_TEMPLATE_CODE, PROMPT_NOT_FOUND_CODE, PromptError } from "../../ai/prompts/render";
import { failure, success } from "../../utils/response";
import type { UpdatePromptTemplateBody } from "./admin.prompts.schema";
import { getAdminPrompt, listAdminPrompts, resetAdminPrompt, updateAdminPrompt } from "./admin.prompts.service";

function handlePromptError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof PromptError && error.code === PROMPT_NOT_FOUND_CODE) {
    return failure(res, error.code, error.message, 404);
  }
  if (error instanceof PromptError && error.code === PROMPT_INVALID_TEMPLATE_CODE) {
    return failure(res, error.code, error.message, 400, { variables: error.variables });
  }
  return next(error);
}

export function requireKnownPromptKey(req: Request, res: Response, next: NextFunction) {
  if (!getPromptDefinition(req.params.key)) {
    return failure(res, PROMPT_NOT_FOUND_CODE, "Không tìm thấy mẫu prompt", 404);
  }
  return next();
}

export async function listAdminPromptsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await listAdminPrompts());
  } catch (error) {
    return next(error);
  }
}

export async function getAdminPromptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await getAdminPrompt(req.params.key));
  } catch (error) {
    return handlePromptError(error, res, next);
  }
}

export async function updateAdminPromptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await updateAdminPrompt(req.user.id, req.params.key, req.body as UpdatePromptTemplateBody));
  } catch (error) {
    return handlePromptError(error, res, next);
  }
}

export async function resetAdminPromptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await resetAdminPrompt(req.user.id, req.params.key));
  } catch (error) {
    return handlePromptError(error, res, next);
  }
}