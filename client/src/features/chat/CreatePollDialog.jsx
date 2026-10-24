import React, { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, BarChart2 } from "lucide-react";
import { toast } from "sonner";

const MAX_OPTIONS = 12;

export function CreatePollDialog({ open, onOpenChange, onSubmit }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultipleAnswers(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleOptionChange = (index, value) => {
    setOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddOption = () => {
    if (options.length >= MAX_OPTIONS) {
      toast.error(`Maximum ${MAX_OPTIONS} options allowed.`);
      return;
    }
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index) => {
    if (options.length <= 2) {
      toast.error("A poll must have at least 2 options.");
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error("Please enter a question.");
      return;
    }

    const validOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast.error("Please provide at least 2 non-empty options.");
      return;
    }

    // Check for duplicates
    const uniqueOptions = new Set(validOptions.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== validOptions.length) {
      toast.error("Options cannot be duplicates.");
      return;
    }

    setIsSubmitting(true);
    try {
      const pollData = {
        question: trimmedQuestion,
        options: validOptions.map((text, idx) => ({
          id: `opt_${Date.now()}_${idx}`,
          text,
        })),
        allowMultipleAnswers,
      };

      const result = await onSubmit(pollData);
      if (result !== false) {
        handleClose();
      }
    } catch (err) {
      toast.error(err.message || "Failed to create poll");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create Poll</h2>
            <p className="text-xs text-muted-foreground">
              Ask a question and let room members vote
            </p>
          </div>
        </div>

        {/* Question field */}
        <div className="space-y-1.5">
          <Label htmlFor="poll-question" className="text-xs font-medium">
            Question
          </Label>
          <Input
            id="poll-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            maxLength={300}
            autoFocus
            className="w-full"
          />
        </div>

        {/* Options list */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Options</Label>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs font-medium text-muted-foreground">
                  {index + 1}.
                </span>
                <Input
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Option ${index + 1}`}
                  maxLength={100}
                  className="flex-1"
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveOption(index)}
                    aria-label={`Remove option ${index + 1}`}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {options.length < MAX_OPTIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddOption}
              className="mt-1 flex w-full items-center justify-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Option
            </Button>
          )}
        </div>

        {/* Multiple Answers Toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="multiple-answers" className="cursor-pointer text-sm font-medium">
              Allow multiple answers
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Voters can choose more than one option
            </p>
          </div>
          <input
            id="multiple-answers"
            type="checkbox"
            checked={allowMultipleAnswers}
            onChange={(e) => setAllowMultipleAnswers(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !question.trim() ||
              options.filter((o) => o.trim()).length < 2
            }
          >
            {isSubmitting ? "Creating…" : "Create Poll"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
