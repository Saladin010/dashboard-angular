import { ProblemDetails } from '../models/common.model';

/**
 * Extracts user-friendly error text from ASP.NET Core ProblemDetails / FluentValidation responses.
 */
export function extractApiErrorMessage(err: any, fallback: string): string {
  const body = err?.error as ProblemDetails | { message?: string } | string | undefined;

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (body && typeof body === 'object') {
    const pd = body as ProblemDetails;
    if (pd.errors && typeof pd.errors === 'object') {
      const messages = Object.entries(pd.errors)
        .flatMap(([field, msgs]) =>
          Array.isArray(msgs) ? msgs.map((m) => (field && field !== '$' ? `${field}: ${m}` : m)) : []
        )
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(' | ');
      }
    }

    if (pd.detail && pd.detail.trim()) {
      return pd.detail;
    }

    const msg = (body as { message?: string }).message;
    if (msg && msg.trim()) {
      return msg;
    }
  }

  if (err?.status === 0) {
    return 'تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.';
  }

  return err?.message || fallback;
}
