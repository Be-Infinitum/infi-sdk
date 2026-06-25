export class InfiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "InfiError";
    this.status = status;
    this.code = code;
  }
}

export async function parseErrorResponse(res: Response): Promise<InfiError> {
  let message = res.statusText || "Request failed";
  let code: string | undefined;
  try {
    const body = (await res.json()) as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    };
    message = body.message ?? body.error?.message ?? message;
    code = body.code ?? body.error?.code;
  } catch {
    // ignore JSON parse errors
  }
  return new InfiError(message, res.status, code);
}
