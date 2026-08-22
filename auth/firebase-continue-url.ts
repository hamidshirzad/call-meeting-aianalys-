export function stripFragmentFromUrl(url: string): string {
  const fragmentStart = url.indexOf('#');
  return fragmentStart === -1 ? url : url.slice(0, fragmentStart);
}

export function prepareFirebaseContinueUrl(
  location: Pick<Location, 'href'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
): void {
  const cleanUrl = stripFragmentFromUrl(location.href);

  if (cleanUrl !== location.href) {
    history.replaceState(history.state, '', cleanUrl);
  }
}
