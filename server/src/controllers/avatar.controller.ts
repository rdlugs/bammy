import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { publicUser } from "./auth.controller.ts";

export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 512 * 1024;
type AvatarType = (typeof AVATAR_TYPES)[number];

// The declared type must match the bytes, so a file is never served under a
// type it is not. SVG is not on the list at all: it can carry script.
const SIGNATURES: Record<AvatarType, (data: Buffer) => boolean> = {
  "image/png": (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (data) => data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/webp": (data) => data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP",
};

function isAvatarType(type: string): type is AvatarType {
  return (AVATAR_TYPES as readonly string[]).includes(type);
}

// The body arrives raw (see settings.routes.ts); anything the raw parser did
// not accept is left as the JSON parser's empty object, not a Buffer.
export async function uploadAvatar(req: Request, res: Response) {
  const type = req.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const data = req.body;
  if (!isAvatarType(type) || !Buffer.isBuffer(data) || data.length === 0) {
    throw new HttpError(400, "Upload a PNG, JPEG or WebP image");
  }
  if (!SIGNATURES[type](data)) {
    throw new HttpError(400, "The file is not a valid image of the type it claims");
  }

  const bytes = new Uint8Array(data);
  const user = await prisma.$transaction(async (tx) => {
    await tx.userAvatar.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, data: bytes, mimeType: type },
      update: { data: bytes, mimeType: type },
    });
    return tx.user.update({ where: { id: req.userId }, data: { avatarUpdatedAt: new Date() }, select: publicUser });
  });
  res.json({ user });
}

export async function removeAvatar(req: Request, res: Response) {
  const user = await prisma.$transaction(async (tx) => {
    await tx.userAvatar.deleteMany({ where: { userId: req.userId } });
    return tx.user.update({ where: { id: req.userId }, data: { avatarUpdatedAt: null }, select: publicUser });
  });
  res.json({ user });
}

// Any signed-in user may see any avatar: they appear in user and member lists.
// The client puts the upload time in the URL, so a long cache is safe.
export async function showAvatar(req: Request, res: Response) {
  const { id } = z.object({ id: z.uuid() }).safeParse(req.params).data ?? {};
  const avatar = id ? await prisma.userAvatar.findUnique({ where: { userId: id } }) : null;
  if (!avatar) {
    throw new HttpError(404, "No profile picture");
  }
  res.set({
    "Content-Type": avatar.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'",
  });
  res.send(Buffer.from(avatar.data));
}
