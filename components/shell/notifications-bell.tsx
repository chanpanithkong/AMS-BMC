"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { miscApi } from "@/lib/api/endpoints/org";
import type { AppNotification } from "@/lib/api/types/org";
import { useSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format/dates";
import { useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/** Notifications bell with an unread count (SRS §14.1). */
export function NotificationsBell() {
  const t = useTranslations("shell.notifications");
  const locale = useAppLocale();
  const router = useAppRouter();
  const queryClient = useQueryClient();
  const dateFormat = useSession((s) => s.user?.date_format);
  const [open, setOpen] = useState(false);

  const query = useQuery({ queryKey: ["notifications"], queryFn: miscApi.notifications, refetchInterval: 60_000 });
  const items = query.data?.data ?? [];
  const unread = items.filter((n) => !n.read).length;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markAll = useMutation({ mutationFn: miscApi.markAllNotificationsRead, onSuccess: invalidate });
  const markOne = useMutation({ mutationFn: miscApi.markNotificationRead, onSuccess: invalidate });

  const openItem = (item: AppNotification) => {
    if (!item.read) markOne.mutate(item.id);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("open", { count: unread })}>
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white"
              data-testid="unread-count"
              aria-hidden
            >
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t("title")}</p>
          <Button variant="ghost" size="xs" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            {t("markAllRead")}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {query.isPending && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          )}
          {query.isError && <ErrorState compact error={query.error} onRetry={() => query.refetch()} />}
          {query.isSuccess && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          )}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm outline-none last:border-b-0",
                    "hover:bg-muted focus-visible:bg-muted",
                    !item.read && "bg-info/5",
                  )}
                >
                  <span className={cn(!item.read && "font-medium")}>{locale === "km" ? item.title_km : item.title}</span>
                  <span className="text-xs text-muted-foreground">{locale === "km" ? item.body_km : item.body}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(item.created_at, dateFormat)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
