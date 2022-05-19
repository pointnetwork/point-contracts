import { mkdir } from "fs/promises";
import { statAsync } from "./statAsync";

export const makeSurePathExists = async (
  pathToCheck: string,
  createIfNotExists = false
) => {
  try {
    await statAsync(pathToCheck);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT" && createIfNotExists) {
      await mkdir(pathToCheck, { recursive: true });
    } else {
      throw e;
    }
  }
};
