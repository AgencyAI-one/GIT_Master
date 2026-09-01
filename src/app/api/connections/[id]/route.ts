import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/db";
import { apiError, HttpError, requireApiSession } from "@/lib/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireApiSession(request);
    const { id } = await params;
    if (!deleteConnection(id)) throw new HttpError(404, "Connection not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
