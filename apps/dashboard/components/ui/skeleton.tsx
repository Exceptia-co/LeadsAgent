"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  animation?: "pulse" | "wave" | "none";
}

export function Skeleton({
  className = "",
  variant = "rectangular",
  width,
  height,
  animation = "pulse",
}: SkeletonProps) {
  const baseClasses = "bg-gray-200 dark:bg-gray-700";

  const variantClasses = {
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-md",
  };

  const animationClasses = {
    pulse: "animate-pulse",
    wave: "animate-pulse", // Could add custom wave animation
    none: "",
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height)
    style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
    />
  );
}

// Predefined skeleton components for common use cases
export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          height="1rem"
          className={index === lines - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p-6 border border-gray-200 rounded-lg ${className}`}>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton height="1.5rem" width="60%" />
            <Skeleton height="1rem" width="40%" />
          </div>
          <Skeleton variant="circular" width={40} height={40} />
        </div>
        <div className="space-y-2">
          <Skeleton height="1rem" width="100%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="90%" />
        </div>
        <div className="pt-3 border-t border-gray-100">
          <Skeleton height="2rem" width="30%" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonBadge({ className = "" }: { className?: string }) {
  return (
    <Skeleton
      variant="text"
      width={24}
      height={20}
      className={`rounded-full ${className}`}
    />
  );
}

export function SkeletonButton({ className = "" }: { className?: string }) {
  return (
    <Skeleton
      variant="rectangular"
      height="2.5rem"
      className={`rounded-md ${className}`}
    />
  );
}

export function SkeletonAvatar({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      className={className}
    />
  );
}

// Complex skeleton for the WhatsApp page tabs
export function SkeletonTabs({
  tabCount = 6,
  className = "",
}: {
  tabCount?: number;
  className?: string;
}) {
  return (
    <div className={`border-b border-gray-200 ${className}`}>
      <nav className="-mb-px flex space-x-8">
        {Array.from({ length: tabCount }).map((_, index) => (
          <div key={index} className="flex items-center py-2 px-1">
            <Skeleton
              variant="circular"
              width={16}
              height={16}
              className="mr-2"
            />
            <Skeleton
              height="1rem"
              width={Math.random() * 40 + 60}
              className="mr-2"
            />
            <SkeletonBadge />
          </div>
        ))}
      </nav>
    </div>
  );
}

// Skeleton for session cards grid
export function SkeletonSessionGrid({
  count = 6,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
