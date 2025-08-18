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
  hasTavilyKey?: boolean;
  setModels: (models: UserModel[], defaultModelId?: string) => void;
  setActiveModelId: (id?: string) => void;
  setStatus: (ready: boolean, hasTavilyKey: boolean) => void;
  clear: () => void;
};

export const useModelStore = create<ModelStoreState>((set) => ({
  models: [],
  defaultModelId: undefined,
  activeModelId: undefined,
  ready: undefined,
  hasTavilyKey: undefined,
  setModels: (models: UserModel[], defaultModelId?: string) => set(() => ({ models, defaultModelId })),
  setActiveModelId: (id?: string) => set(() => ({ activeModelId: id })),
  setStatus: (ready: boolean, hasTavilyKey: boolean) => set(() => ({ ready, hasTavilyKey })),
  clear: () => set({ models: [], defaultModelId: undefined, activeModelId: undefined }),
}));


