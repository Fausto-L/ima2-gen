let composeSheetOpener: HTMLButtonElement | null = null;

export function rememberMobileComposeSheetOpener(opener: HTMLButtonElement): void {
  composeSheetOpener = opener;
}

export function restoreMobileComposeSheetOpener(): void {
  const opener = composeSheetOpener;
  composeSheetOpener = null;
  if (opener?.isConnected) opener.focus();
}

export function clearMobileComposeSheetOpener(): void {
  composeSheetOpener = null;
}
