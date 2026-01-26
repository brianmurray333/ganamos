"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TouchBadNumberInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function TouchBadNumberInput({ 
  value, 
  onChange, 
  placeholder = "0", 
  className,
  disabled = false 
}: TouchBadNumberInputProps) {
  const [displayValue, setDisplayValue] = useState(value || "")

  const handleNumberClick = (num: string) => {
    if (disabled) return
    
    const newValue = displayValue + num
    setDisplayValue(newValue)
    onChange(newValue)
  }

  const handleBackspace = () => {
    if (disabled) return
    
    const newValue = displayValue.slice(0, -1)
    setDisplayValue(newValue)
    onChange(newValue)
  }

  const handleClear = () => {
    if (disabled) return
    
    setDisplayValue("")
    onChange("")
  }

  // Update display value when prop changes
  React.useEffect(() => {
    setDisplayValue(value || "")
  }, [value])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Display */}
      <div className="text-center">
        <div className="text-4xl font-bold text-foreground mb-2">
          {displayValue || placeholder}
        </div>
        <div className="text-sm text-muted-foreground">
          BTC ↓↑
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {/* Row 1 */}
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("1")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          1
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("2")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          2
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("3")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          3
        </Button>

        {/* Row 2 */}
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("4")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          4
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("5")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          5
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("6")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          6
        </Button>

        {/* Row 3 */}
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("7")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          7
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("8")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          8
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("9")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          9
        </Button>

        {/* Row 4 */}
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick(".")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          .
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => handleNumberClick("0")}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          0
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handleBackspace}
          disabled={disabled}
          className="h-12 text-lg font-medium"
        >
          ←
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-center">
        <Button
          variant="outline"
          onClick={handleClear}
          disabled={disabled}
          className="flex-1 max-w-32"
        >
          Clear
        </Button>
        <Button
          onClick={() => {
            // This would be handled by parent component
            console.log("Done clicked with value:", displayValue)
          }}
          disabled={disabled || !displayValue}
          className="flex-1 max-w-32 bg-primary text-primary-foreground"
        >
          Done
        </Button>
      </div>
    </div>
  )
}
