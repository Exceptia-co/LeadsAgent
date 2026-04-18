import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UnifiedUser, UnifiedAuthError } from "../auth/unified-auth";

// Lazy initialization to avoid build-time errors
let supabaseInstance: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Missing Supabase environment variables");
    }

    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

export interface CreateUserData {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string;
}

export interface UpdateUserData {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string;
  isActive?: boolean;
  settings?: Record<string, any>;
}

export interface UserFilters {
  role?: string;
  isActive?: boolean;
  search?: string; // Busca en nombre y email
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

/**
 * Servicio de usuarios que maneja la sincronización entre Clerk y Supabase
 */
export class UserService {
  /**
   * Obtiene un usuario por su Clerk ID
   */
  static async getUserByClerkId(clerkId: string): Promise<UnifiedUser | null> {
    try {
      const { data: user, error } = await getSupabase()
        .from("users")
        .select("*")
        .eq("clerk_id", clerkId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null; // Usuario no encontrado
        }
        throw error;
      }

      return this.mapToUnifiedUser(user);
    } catch (error) {
      console.error("Error getting user by Clerk ID:", error);
      throw new UnifiedAuthError("Failed to get user", "USER_FETCH_ERROR", 500);
    }
  }

  /**
   * Obtiene un usuario por su ID de Supabase
   */
  static async getUserById(id: string): Promise<UnifiedUser | null> {
    try {
      const { data: user, error } = await getSupabase()
        .from("users")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw error;
      }

      return this.mapToUnifiedUser(user);
    } catch (error) {
      console.error("Error getting user by ID:", error);
      throw new UnifiedAuthError("Failed to get user", "USER_FETCH_ERROR", 500);
    }
  }

  /**
   * Crea un nuevo usuario en Supabase
   */
  static async createUser(userData: CreateUserData): Promise<UnifiedUser> {
    try {
      const { data: newUser, error } = await getSupabase()
        .from("users")
        .insert({
          clerk_id: userData.clerkId,
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          profile_image_url: userData.profileImageUrl,
          role: userData.role || "user",
          is_active: true,
          settings: {
            notifications: {
              email: true,
              push: true,
              whatsapp: true,
            },
            preferences: {
              language: "es",
              timezone: "Europe/Madrid",
              dashboard_view: "grid",
            },
          },
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating user:", error);
        throw new UnifiedAuthError("Failed to create user", "USER_CREATE_ERROR", 500);
      }

      console.log("✅ User created successfully:", {
        id: newUser.id,
        email: newUser.email,
      });
      return this.mapToUnifiedUser(newUser);
    } catch (error) {
      console.error("Error in createUser:", error);
      if (error instanceof UnifiedAuthError) {
        throw error;
      }
      throw new UnifiedAuthError("Failed to create user", "USER_CREATE_ERROR", 500);
    }
  }

  /**
   * Actualiza un usuario existente
   */
  static async updateUser(
    clerkId: string,
    updateData: UpdateUserData,
  ): Promise<UnifiedUser | null> {
    try {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };

      // Solo actualizar campos que se proporcionaron
      if (updateData.email !== undefined) updates.email = updateData.email;
      if (updateData.firstName !== undefined) updates.first_name = updateData.firstName;
      if (updateData.lastName !== undefined) updates.last_name = updateData.lastName;
      if (updateData.profileImageUrl !== undefined)
        updates.profile_image_url = updateData.profileImageUrl;
      if (updateData.role !== undefined) updates.role = updateData.role;
      if (updateData.isActive !== undefined) updates.is_active = updateData.isActive;
      if (updateData.settings !== undefined) updates.settings = updateData.settings;

      const { data: updatedUser, error } = await getSupabase()
        .from("users")
        .update(updates)
        .eq("clerk_id", clerkId)
        .select()
        .single();

      if (error) {
        console.error("Error updating user:", error);
        throw new UnifiedAuthError("Failed to update user", "USER_UPDATE_ERROR", 500);
      }

      console.log("✅ User updated successfully:", {
        clerkId,
        fields: Object.keys(updates),
      });
      return this.mapToUnifiedUser(updatedUser);
    } catch (error) {
      console.error("Error in updateUser:", error);
      if (error instanceof UnifiedAuthError) {
        throw error;
      }
      throw new UnifiedAuthError("Failed to update user", "USER_UPDATE_ERROR", 500);
    }
  }

  /**
   * Desactiva un usuario (soft delete)
   */
  static async deactivateUser(clerkId: string): Promise<boolean> {
    try {
      const { error } = await getSupabase()
        .from("users")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("clerk_id", clerkId);

      if (error) {
        console.error("Error deactivating user:", error);
        return false;
      }

      console.log("✅ User deactivated successfully:", { clerkId });
      return true;
    } catch (error) {
      console.error("Error in deactivateUser:", error);
      return false;
    }
  }

  /**
   * Obtiene usuarios con filtros y paginación
   */
  static async getUsers(filters: UserFilters = {}, pagination: PaginationOptions = {}) {
    try {
      const { page = 1, limit = 20, orderBy = "created_at", orderDirection = "desc" } = pagination;

      let query = getSupabase().from("users").select("*", { count: "exact" });

      // Aplicar filtros
      if (filters.role) {
        query = query.eq("role", filters.role);
      }

      if (filters.isActive !== undefined) {
        query = query.eq("is_active", filters.isActive);
      }

      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
        );
      }

      // Aplicar ordenación y paginación
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const {
        data: users,
        error,
        count,
      } = await query.order(orderBy, { ascending: orderDirection === "asc" }).range(from, to);

      if (error) {
        console.error("Error getting users:", error);
        throw new UnifiedAuthError("Failed to get users", "USERS_FETCH_ERROR", 500);
      }

      const unifiedUsers = users?.map((user) => this.mapToUnifiedUser(user)) || [];

      return {
        users: unifiedUsers,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
          hasNext: to < (count || 0) - 1,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error in getUsers:", error);
      if (error instanceof UnifiedAuthError) {
        throw error;
      }
      throw new UnifiedAuthError("Failed to get users", "USERS_FETCH_ERROR", 500);
    }
  }

  /**
   * Obtiene estadísticas de usuarios
   */
  static async getUsersStats() {
    try {
      const { count: totalUsers } = await getSupabase()
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: activeUsers } = await getSupabase()
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      const { count: admins } = await getSupabase()
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);

      // Usuarios registrados en los últimos 30 días
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: recentUsers } = await getSupabase()
        .from("users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());

      return {
        total: totalUsers || 0,
        active: activeUsers || 0,
        inactive: (totalUsers || 0) - (activeUsers || 0),
        admins: admins || 0,
        recentUsers: recentUsers || 0,
      };
    } catch (error) {
      console.error("Error getting users stats:", error);
      throw new UnifiedAuthError("Failed to get users statistics", "STATS_FETCH_ERROR", 500);
    }
  }

  /**
   * Actualiza el último login de un usuario
   */
  static async updateLastLogin(clerkId: string): Promise<boolean> {
    try {
      const { error } = await getSupabase()
        .from("users")
        .update({
          last_login_at: new Date().toISOString(),
        })
        .eq("clerk_id", clerkId);

      if (error) {
        console.error("Error updating last login:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error in updateLastLogin:", error);
      return false;
    }
  }

  /**
   * Mapea un usuario de Supabase a UnifiedUser
   */
  private static mapToUnifiedUser(user: any): UnifiedUser {
    return {
      clerkId: user.clerk_id,
      supabaseId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profileImageUrl: user.profile_image_url,
      role: user.role,
      isActive: user.is_active,
      settings: user.settings || {},
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }
}

/**
 * Helper functions para usar en API routes
 */
export const userService = UserService;
