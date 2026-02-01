import { toast } from 'sonner';

/**
 * Copy text to clipboard with fallback for HTTP (non-secure contexts)
 * Uses modern Clipboard API when available (HTTPS), falls back to execCommand for HTTP
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Try modern clipboard API first (requires HTTPS/secure context)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for HTTP: use legacy execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!success) {
      throw new Error('execCommand copy failed');
    }

    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Copy text to clipboard and show a toast notification
 * @param text - The text to copy
 * @param successMessage - Custom success message (default: "Copied!")
 * @param errorMessage - Custom error message (default: "Failed to copy")
 */
export async function copyWithToast(
  text: string,
  successMessage = 'Copied!',
  errorMessage = 'Failed to copy'
): Promise<boolean> {
  const success = await copyToClipboard(text);
  if (success) {
    toast.success(successMessage);
  } else {
    toast.error(errorMessage);
  }
  return success;
}
