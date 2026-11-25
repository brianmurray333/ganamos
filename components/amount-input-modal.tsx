"use client"

import React, { useState } from "react"
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AmountInputModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAmountSet: (amount: string) => void
  currentAmount?: string
}

export function AmountInputModal({ 
  open, 
  onOpenChange, 
  onAmountSet,
  currentAmount = ""
}: AmountInputModalProps) {
  const [displayValue, setDisplayValue] = useState(currentAmount || "")

  const formatNumber = (value: string) => {
    if (!value) return "0"
    const num = parseInt(value.replace(/,/g, ''))
    return num.toLocaleString()
  }

  const handleNumberClick = (num: string) => {
    const currentNum = displayValue.replace(/,/g, '')
    const newValue = currentNum + num
    setDisplayValue(newValue)
  }

  const handleBackspace = () => {
    const currentNum = displayValue.replace(/,/g, '')
    const newValue = currentNum.slice(0, -1)
    setDisplayValue(newValue)
  }

  const handleClear = () => {
    setDisplayValue("")
  }

  const handleDone = () => {
    onAmountSet(displayValue.replace(/,/g, ''))
    onOpenChange(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDone()
    }
  }

  // Update display value when currentAmount changes
  React.useEffect(() => {
    setDisplayValue(currentAmount || "")
  }, [currentAmount])

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        onDismiss={() => onOpenChange(false)}
        aria-describedby={undefined}
        header={<BottomSheetTitle className="sr-only">Add amount</BottomSheetTitle>}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-6 lg:pt-16 space-y-6">
          {/* Display */}
          <div className="text-center" onKeyDown={handleKeyPress} tabIndex={0}>
            <div className="text-4xl font-bold text-foreground mb-2">
              {formatNumber(displayValue)}
            </div>
            <div className="text-sm text-muted-foreground">
              sats to deposit
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {/* Row 1 */}
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("1")}
              className="h-12 text-lg font-medium"
            >
              1
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("2")}
              className="h-12 text-lg font-medium"
            >
              2
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("3")}
              className="h-12 text-lg font-medium"
            >
              3
            </Button>

            {/* Row 2 */}
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("4")}
              className="h-12 text-lg font-medium"
            >
              4
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("5")}
              className="h-12 text-lg font-medium"
            >
              5
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("6")}
              className="h-12 text-lg font-medium"
            >
              6
            </Button>

            {/* Row 3 */}
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("7")}
              className="h-12 text-lg font-medium"
            >
              7
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("8")}
              className="h-12 text-lg font-medium"
            >
              8
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("9")}
              className="h-12 text-lg font-medium"
            >
              9
            </Button>

            {/* Row 4 */}
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick(".")}
              className="h-12 text-lg font-medium"
            >
              .
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleNumberClick("0")}
              className="h-12 text-lg font-medium"
            >
              0
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleBackspace}
              className="h-12 text-lg font-medium"
            >
              ←
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center">
            <Button
              size="xl"
              variant="outline"
              onClick={handleClear}
              className="flex-1 max-w-32"
            >
              Clear
            </Button>
            <Button
              size="xl"
              onClick={handleDone}
              disabled={!displayValue}
              className="flex-1 max-w-32 bg-primary text-white hover:bg-primary/90"
            >
              Done
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

