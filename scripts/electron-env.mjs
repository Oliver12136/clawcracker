export function desktopEnv(extra = {}) {
  const env = {
    ...process.env,
    ...extra,
  };

  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  return env;
}
