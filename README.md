# O.L.L.E. PWA

Publik installationsyta för O.L.L.E. PWA. Personlig data ligger bakom Supabase-inloggning.

## Composio

Appen pratar med Composio via Supabase Edge Function `composio` (`supabase/functions/composio`), så API-nyckeln aldrig hamnar i den publika appen.

```
supabase secrets set COMPOSIO_API_KEY=<din nyckel>
supabase functions deploy composio
```

Koppla tjänster (Gmail, Kalender m.fl.) i Composios dashboard under samma användar-id som Supabase-användaren. Tillåtna verktyg styrs av `ALLOWED_TOOLS` i funktionen. Använd i appen: `composioExecute("GMAIL_FETCH_EMAILS", {...})` från `lib/composio/client.ts`.
