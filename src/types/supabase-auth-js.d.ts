declare module "@supabase/auth-js" {
  export type Session = {
    access_token: string;
    user: User;
    [key: string]: unknown;
  };

  export type User = {
    id: string;
    email?: string | null;
    user_metadata?: {
      full_name?: string;
      name?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  export type GoTrueClientOptions = Record<string, unknown>;

  export type AuthChangeEvent = string;

  export type AuthResponse = {
    data: {
      session: Session | null;
      user: User | null;
    };
    error: Error | null;
  };

  export type UserResponse = {
    data: {
      user: User | null;
    };
    error: Error | null;
  };

  export type Subscription = {
    unsubscribe(): void;
  };

  export class AuthClient {
    getUser(jwt?: string): Promise<UserResponse>;
    getSession(): Promise<AuthResponse>;
    signOut(): Promise<{ error: Error | null }>;
    onAuthStateChange(
      callback: (event: AuthChangeEvent, session: Session | null) => void,
    ): { data: { subscription: Subscription } };
    updateUser(attributes: Record<string, unknown>): Promise<{ error: Error | null }>;
    signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: Error | null }>;
    signUp(credentials: Record<string, unknown>): Promise<{ error: Error | null }>;
    signInWithOAuth(credentials: Record<string, unknown>): Promise<{ error: Error | null }>;
    setSession(session: any): Promise<{ error: Error | null }>;
    getClaims(jwt?: string): Promise<{ data: { claims: { sub?: string; [key: string]: unknown } } | null; error: Error | null }>;
  }
}
