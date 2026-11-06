import React, { useState } from "react";
import { Plus, Trash2, BarChart2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;

// Dialog for building a poll: question, options and the multiple-answers switch
export function CreatePollDialog({ open, onOpenChange, onSubmit }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filledOptionCount = options.filter((o) => o.trim()).length;
  const canSubmit =
    !isSubmitting && question.trim() && filledOptionCount >= MIN_OPTIONS;

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
    setOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  };

  const handleAddOption = () => {
    if (options.length >= MAX_OPTIONS) {
      toast.error(`Maximum ${MAX_OPTIONS} options allowed.`);
      return;
    }
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index) => {
    if (options.length <= MIN_OPTIONS) {
      toast.error(`A poll must have at least ${MIN_OPTIONS} options.`);
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  // Validates, then hands the poll to the parent; stays open if it returns false
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error("Please enter a question.");
      return;
    }

    const validOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (validOptions.length < MIN_OPTIONS) {
      toast.error(`Please provide at least ${MIN_OPTIONS} non-empty options.`);
      return;
    }

    const uniqueOptions = new Set(validOptions.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== validOptions.length) {
      toast.error("Options cannot be duplicates.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        question: trimmedQuestion,
        options: validOptions.map((text, idx) => ({
          id: `opt_${Date.now()}_${idx}`,
          text,
        })),
        allowMultipleAnswers,
      });
      if (result !== false) handleClose();
    } catch (err) {
      toast.error(err.message || "Failed to create poll");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enter submits, Shift+Enter is ignored
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
            <h2 className="text-lg font-semibold text-foreground">
              Create Poll
            </h2>
            <p className="text-xs text-muted-foreground">
              Ask a question and let room members vote
            </p>
          </div>
        </div>

        {/* Question */}
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

        {/* Options */}
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
                {options.length > MIN_OPTIONS && (
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

        {/* Multiple answers */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-0.5">
            <Label
              htmlFor="multiple-answers"
              className="cursor-pointer text-sm font-medium"
            >
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
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? "Creating…" : "Create Poll"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
