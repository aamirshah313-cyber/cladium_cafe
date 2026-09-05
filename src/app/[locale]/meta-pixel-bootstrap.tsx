/**
 * Meta Pixel bootstrap — Runbook Step 37 follow-up.
 *
 * Only ever rendered by `[locale]/layout.tsx` once
 * `modules/integrations/meta-pixel.ts#resolveMetaPixelId` has already
 * confirmed `FEATURE_META_MARKETING` is on, `META_PIXEL_ID` is configured,
 * and this guest's session has granted `META_MARKETING` consent — this
 * component itself makes no gating decision.
 *
 * Meta's own documented base code, verbatim in structure (the `!function`
 * IIFE that lazily loads `fbevents.js` and calls `fbq('init'
 * )`/`fbq('track','PageView')`), interpolating only the already-validated
 * `pixelId` prop. A plain `<script>{code}</script>` string child, never
 * `dangerouslySetInnerHTML` — this codebase's own security invariant
 * (confirmed structurally at Step 40: zero `dangerouslySetInnerHTML`
 * anywhere in `src`) stays true. `JSON.stringify(pixelId)` embeds it as a
 * safe JS string literal regardless of trust level; the `<noscript>`
 * fallback `<img>` URL-encodes it the same way for its query string.
 *
 * Needs `script-src`/`connect-src` to allow `connect.facebook.net` — see
 * `next.config.ts`'s `metaConnectSrc`/`metaScriptSrc`, wired only under
 * the same flag+pixel-id condition. `img-src` already allows any `https:`
 * source, so the `<noscript>` fallback needs no CSP change.
 */

interface MetaPixelBootstrapProps {
  readonly pixelId: string;
}

export function MetaPixelBootstrap({ pixelId }: MetaPixelBootstrapProps) {
  const encodedPixelId = JSON.stringify(pixelId);
  const script = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${encodedPixelId});
fbq('track', 'PageView');`;

  return (
    <>
      <script>{script}</script>
      <noscript>
        <img
          height={1}
          width={1}
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
