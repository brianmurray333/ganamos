"use client"

import { createContext, useContext, useState, ReactNode } from "react"

interface DonationModalContextType {
  openDonationModal: () => void
  closeDonationModal: () => void
  isOpen: boolean
}

const DonationModalContext = createContext<DonationModalContextType | undefined>(undefined)

export function DonationModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openDonationModal = () => setIsOpen(true)
  const closeDonationModal = () => setIsOpen(false)

  return (
    <DonationModalContext.Provider value={{ openDonationModal, closeDonationModal, isOpen }}>
      {children}
    </DonationModalContext.Provider>
  )
}

export function useDonationModal() {
  const context = useContext(DonationModalContext)
  // Return undefined if context is not available (allows graceful fallback)
  return context
}

