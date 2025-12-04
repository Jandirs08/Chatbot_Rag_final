"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings#brain");
  }, [router]);
  return null;
}
import { botService } from "@/app/lib/services/botService";
