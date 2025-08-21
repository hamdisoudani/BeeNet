"use client";

import { create } from "zustand";

export type UserModel = {
  id: string;
  name: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
};

type ModelStoreState = {
  models: UserModel[];
  defaultModelId?: string;
  activeModelId?: string;
  ready?: boolean;
  hasSerperKey?: boolean;
  statusLoading?: boolean;
  statusError?: boolean;
  setModels: (models: UserModel[], defaultModelId?: string) => void;
  setActiveModelId: (id?: string) => void;
  setStatus: (ready: boolean, hasSerperKey: boolean) => void;
  setStatusLoading: (loading: boolean) => void;
  setStatusError: (err: boolean) => void;
  clear: () => void;
};

export const useModelStore = create<ModelStoreState>((set) => ({
  models: [],
  defaultModelId: undefined,
  activeModelId: undefined,
  ready: undefined,
  hasSerperKey: undefined,
  statusLoading: true,
  statusError: false,
  setModels: (models: UserModel[], defaultModelId?: string) => set(() => ({ models, defaultModelId })),
  setActiveModelId: (id?: string) => set(() => ({ activeModelId: id })),
  setStatus: (ready: boolean, hasSerperKey: boolean) => set(() => ({ ready, hasSerperKey })),
  setStatusLoading: (loading: boolean) => set(() => ({ statusLoading: loading })),
  setStatusError: (err: boolean) => set(() => ({ statusError: err })),
  clear: () => set({ models: [], defaultModelId: undefined, activeModelId: undefined }),
}));


