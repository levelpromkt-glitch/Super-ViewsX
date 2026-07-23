import { logger } from "./logger.ts";

export const handleError = (error: any) => {
  logger.error("Function execution failed", { error: error.message, stack: error.stack });
  
  const code = error.code || "INTERNAL_ERROR";
  const message = error.message || "An unexpected error occurred.";
  const status = error.status || 500;
  
  return new Response(
    JSON.stringify({ success: false, code, message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
};

export class AppError extends Error {
  constructor(public message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = "AppError";
  }
}
