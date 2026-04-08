import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to a temp-uploads directory in public for visibility and easy absolute path access
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    
    // Ensure directory exists
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (e) {}

    const fileName = `${Date.now()}_${file.name.replace(/ /g, "_")}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    // Return the ABSOLUTE path for the local bridge to use
    return NextResponse.json({ 
      ok: true, 
      filePath: filePath,
      fileName: fileName,
      url: `/uploads/${fileName}`
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
