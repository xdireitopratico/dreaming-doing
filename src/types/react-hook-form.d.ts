declare module "react-hook-form" {
  import * as React from "react";

  export type FieldValues = Record<string, any>;
  export type FieldPath<TFieldValues extends FieldValues = FieldValues> = string & keyof TFieldValues;
  export type ControllerProps<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  > = {
    name: TName;
    control?: unknown;
    render?: (props: { field: unknown; fieldState: unknown; formState: unknown }) => React.ReactNode;
  };

  export const Controller: React.ComponentType<any>;
  export const FormProvider: React.ComponentType<any>;
  export function useFormContext<TFieldValues extends FieldValues = FieldValues>(): {
    getFieldState: (name: FieldPath<TFieldValues>, formState: unknown) => { error?: { message?: string } };
    formState: unknown;
  };
}
