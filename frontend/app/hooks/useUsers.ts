"use client";

import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";
import { authService } from "@/app/lib/services/authService";
import {
  userService,
  type CreateUserData,
  type ListUsersParams,
  type PaginatedUsersResponse,
  type UserListItem,
} from "@/app/lib/services/userService";
import {
  USERS_SWR_KEY,
  buildUsersSWRKey,
  type UsersSWRKey,
} from "@/app/lib/swrKeys";

type UserUpdatePayload = Partial<
  CreateUserData & {
    is_active?: boolean;
    is_admin?: boolean;
    password?: string;
  }
>;

interface UseUsersOptions
  extends Omit<SWRConfiguration<PaginatedUsersResponse, Error>, "fetcher"> {
  enabled?: boolean;
}

const usersFetcher = async ([, params]: UsersSWRKey) => {
  return userService.listUsers({
    skip: params.skip,
    limit: params.limit,
    search: params.search || undefined,
    role: params.role || undefined,
    is_active: params.is_active === "all" ? undefined : params.is_active,
  });
};

export function useUsers(
  params: ListUsersParams = {},
  options: UseUsersOptions = {},
) {
  const { enabled = true, ...swrOptions } = options;

  return useSWR<PaginatedUsersResponse, Error>(
    buildUsersSWRKey(params, enabled),
    usersFetcher,
    swrOptions,
  );
}

export function useUsersMutations() {
  const { mutate } = useSWRConfig();

  const invalidateUsersLists = async () => {
    await mutate(
      (key: unknown) => Array.isArray(key) && key[0] === USERS_SWR_KEY,
      undefined,
      { revalidate: true },
    );
  };

  const createUser = async (data: CreateUserData): Promise<UserListItem> => {
    const createdUser = await userService.createUser(data);
    await invalidateUsersLists();
    return createdUser;
  };

  const updateUser = async (
    id: string,
    data: UserUpdatePayload,
  ): Promise<UserListItem> => {
    const updatedUser = await userService.updateUser(id, data);
    await invalidateUsersLists();
    return updatedUser;
  };

  const deleteUser = async (id: string): Promise<void> => {
    await userService.deleteUser(id);
    await invalidateUsersLists();
  };

  const requestPasswordReset = async (email: string): Promise<void> => {
    await authService.requestPasswordReset(email);
  };

  return {
    createUser,
    updateUser,
    deleteUser,
    requestPasswordReset,
    invalidateUsersLists,
  };
}
