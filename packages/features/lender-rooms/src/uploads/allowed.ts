export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

const MAX_NAME_LENGTH = 255;
const SEPARATOR_OR_CONTROL = /[/\\\p{Cc}]/u;
const ONLY_AN_EXTENSION = /^\.[^.]*$/;

const VIDEO_OR_AUDIO =
  /\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv|mpg|mpeg|3gp|mp3|wav|m4a|aac|flac|ogg|oga|wma|aiff|opus)$/i;

export function isVideoOrAudio(name: string): boolean {
  return VIDEO_OR_AUDIO.test(name);
}

export function isUsableFileName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    !SEPARATOR_OR_CONTROL.test(name) &&
    !ONLY_AN_EXTENSION.test(name)
  );
}

export function uploadRefusal(file: {
  name: string;
  size: number;
}): string | null {
  const name = file.name.trim();

  if (!isUsableFileName(name)) {
    return `"${name}" cannot be used as a file name`;
  }

  if (isVideoOrAudio(name)) {
    return `${name} cannot be uploaded: video and audio files are not allowed`;
  }

  return file.size > MAX_UPLOAD_BYTES
    ? `${name} is larger than the 300 MiB limit`
    : null;
}
