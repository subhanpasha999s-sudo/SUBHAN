"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand/tulmin-logo.png";

type TulminLogoMarkProps = {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function TulminLogoMark({
  className,
  imageClassName,
  priority = false,
}: TulminLogoMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        className
      )}
      aria-hidden
    >
      <Image
        src={LOGO_SRC}
        alt=""
        width={512}
        height={512}
        priority={priority}
        className={cn("h-full w-full object-contain", imageClassName)}
      />
    </span>
  );
}

type TulminBrandProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  subtitle?: string;
  showSubtitle?: boolean;
  priority?: boolean;
};

export function TulminBrand({
  className,
  markClassName,
  textClassName,
  titleClassName,
  subtitleClassName,
  subtitle = "Dispatch AI",
  showSubtitle = true,
  priority = false,
}: TulminBrandProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <TulminLogoMark className={markClassName} priority={priority} />
      <span className={cn("min-w-0 leading-tight", textClassName)}>
        <span className={cn("block truncate font-semibold tracking-tight", titleClassName)}>
          Tulmin
        </span>
        {showSubtitle ? (
          <span className={cn("block truncate font-semibold", subtitleClassName)}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
