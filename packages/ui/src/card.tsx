import { type JSX } from "react";

interface CardProps {
  className?: string;
  children?: React.ReactNode;
}

interface CardHeaderProps {
  className?: string;
  children?: React.ReactNode;
}

interface CardTitleProps {
  className?: string;
  children?: React.ReactNode;
}

interface CardDescriptionProps {
  className?: string;
  children?: React.ReactNode;
}

interface CardContentProps {
  className?: string;
  children?: React.ReactNode;
}

interface CardFooterProps {
  className?: string;
  children?: React.ReactNode;
}

export function Card({ className = "", children }: CardProps): JSX.Element {
  return (
    <div
      className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
}: CardHeaderProps): JSX.Element {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
}: CardTitleProps): JSX.Element {
  return (
    <h3
      className={`text-2xl font-semibold leading-none tracking-tight ${className}`}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className = "",
  children,
}: CardDescriptionProps): JSX.Element {
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>
  );
}

export function CardContent({
  className = "",
  children,
}: CardContentProps): JSX.Element {
  return <div className={`p-6 pt-0 ${className}`}>{children}</div>;
}

export function CardFooter({
  className = "",
  children,
}: CardFooterProps): JSX.Element {
  return (
    <div className={`flex items-center p-6 pt-0 ${className}`}>{children}</div>
  );
}
