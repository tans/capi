/**
 * 统一错误模型。对外渲染成 OpenAI 风格的错误体，
 * 对内携带「是否可重试」的标记（对应 New-API 的 types.NewAPIError）。
 */

export type RelayErrorCode =
  | "invalid_api_key"
  | "insufficient_scope"
  | "invalid_request"
  | "model_not_found"
  | "no_available_channel"
  | "channel_error"
  | "upstream_error"
  | "quota_exceeded"
  | "internal_error";

export class RelayError extends Error {
  readonly statusCode: number;
  readonly code: RelayErrorCode;
  readonly type: string;
  readonly param: string | null;
  /** false 表示命中即终止重试（New-API 的 skip-retry 语义） */
  readonly retryable: boolean;
  /** 上游返回的状态码，用于判断是否自动禁用渠道 */
  readonly upstreamStatusCode: number | null;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: RelayErrorCode;
      type?: string;
      param?: string | null;
      retryable?: boolean;
      upstreamStatusCode?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "RelayError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "internal_error";
    this.type = options.type ?? "api_error";
    this.param = options.param ?? null;
    this.retryable = options.retryable ?? false;
    this.upstreamStatusCode = options.upstreamStatusCode ?? null;
  }
}

/** 渠道/网络类错误：必须换渠道重试。 */
export function channelError(message: string, upstreamStatusCode: number | null = null) {
  return new RelayError(message, {
    statusCode: upstreamStatusCode && upstreamStatusCode >= 400 ? upstreamStatusCode : 502,
    code: "channel_error",
    type: "upstream_error",
    retryable: true,
    upstreamStatusCode,
  });
}

/** 上游返回了明确的状态：按状态码区间决定是否重试。 */
export function upstreamError(message: string, statusCode: number) {
  return new RelayError(message, {
    statusCode,
    code: "upstream_error",
    type: "upstream_error",
    retryable: true,
    upstreamStatusCode: statusCode,
  });
}

export function relayErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof RelayError) {
    return Response.json(
      {
        error: {
          type: error.type,
          code: error.code,
          message: requestId ? `${error.message} (request id: ${requestId})` : error.message,
          param: error.param,
        },
      },
      { status: error.statusCode },
    );
  }
  const message = error instanceof Error ? error.message : "internal error";
  return Response.json(
    {
      error: {
        type: "api_error",
        code: "internal_error",
        message: requestId ? `${message} (request id: ${requestId})` : message,
        param: null,
      },
    },
    { status: 500 },
  );
}

/** 判断状态码是否落在区间列表里（对应 shouldMatchStatusCodeRanges）。 */
export function inRanges(code: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => code >= start && code <= end);
}
