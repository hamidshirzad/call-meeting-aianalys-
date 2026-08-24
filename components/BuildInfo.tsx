import { useEffect, useState } from 'react';

interface VersionInfo {
  commit: string;
  ref: string | null;
  environment: string;
}

/**
 * Shows which build is actually serving this page.
 *
 * Without it a fresh deploy and a stale cached one look identical, which is
 * exactly the confusion this removes. The value is fetched from the server
 * rather than baked in at build time, because vite.config.ts is deliberately
 * kept free of `define` and `process.env` — see the client-secret guard. That
 * also makes this report the *server* build, which is what matters when the
 * change being verified is an API change.
 */
export default function BuildInfo() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/version', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((value: VersionInfo) => {
        if (active) setVersion(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;

  return (
    <p className="muted build-info" style={{ margin: '4px 0 0', fontSize: '12px' }}>
      {version ? (
        <>
          Build <code data-testid="build-commit">{version.commit}</code>
          {version.ref ? <> · {version.ref}</> : null}
          {version.environment !== 'development' ? <> · {version.environment}</> : null}
        </>
      ) : (
        <span data-testid="build-loading">Checking build…</span>
      )}
    </p>
  );
}
