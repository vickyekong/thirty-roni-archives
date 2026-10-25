import { createContext, use } from 'react'

type ArchiveContextValue = { openMemory: (id: string) => void }

export const ArchiveContext = createContext<ArchiveContextValue>({ openMemory: () => {} })

export const useArchive = () => use(ArchiveContext)
