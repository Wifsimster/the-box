# PRD: Daily Game Completion Choice

## Introduction

Currently, when a player visits all 10 positions in the daily challenge and makes their final correct guess, the game may auto-complete without giving the player agency over when to see their results. This feature adds a choice modal that appears after the trigger condition, allowing players to either continue attempting skipped games or view their final results.

This improves user experience by letting players decide when they're truly "done" with the daily challenge, rather than being forced to end when the system detects completion criteria.

## Goals

- Give players control over when to end their daily challenge session
- Allow players to return to skipped positions and make additional guess attempts
- Prevent abrupt game endings when the player hasn't finished exploring
- Maintain current scoring logic (no time pressure after trigger)

## User Stories

### US-001: Show completion choice modal
**Description:** As a player, I want to see a choice modal when I've visited all positions and make a correct guess, so that I can decide whether to continue or end the game.

**Acceptance Criteria:**
- [ ] Modal appears when: all 10 positions visited AND player makes a correct guess
- [ ] Modal does NOT appear if there are no skipped positions (all games already found)
- [ ] Modal shows two clear options: "Continue Playing" and "See Results"
- [ ] Modal displays count of remaining unguessed games (e.g., "You have 3 games left to guess")
- [ ] Modal cannot be dismissed by clicking outside (must choose an option)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Continue playing after choice modal
**Description:** As a player, I want to continue guessing skipped games after choosing "Continue Playing", so that I can improve my score.

**Acceptance Criteria:**
- [ ] Clicking "Continue Playing" closes modal and returns to game
- [ ] Player is navigated to the first skipped position (status: 'skipped')
- [ ] Player can navigate between skipped positions using progress dots
- [ ] Player can make guess attempts on skipped positions
- [ ] Correct guesses update score normally
- [ ] Progress dots still show correct (green) vs skipped (default) status
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: End game from choice modal
**Description:** As a player, I want to end the game immediately from the choice modal, so that I can see my final results when I'm satisfied.

**Acceptance Criteria:**
- [ ] Clicking "See Results" triggers the existing game end flow
- [ ] Player is navigated to the challenge_complete/results phase
- [ ] Final score is calculated and displayed
- [ ] Unfound games are revealed in results
- [ ] Leaderboard entry is created/updated
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Re-trigger choice modal after continuing
**Description:** As a player who chose to continue, I want to see the choice modal again when I make another correct guess (if skipped positions remain), so that I can end whenever I want.

**Acceptance Criteria:**
- [ ] After continuing, making a correct guess on a skipped position re-triggers the modal
- [ ] Modal only re-appears if there are still remaining skipped positions
- [ ] If player guesses all remaining games, game completes normally (no modal needed)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Hide EndGameButton when choice modal is available
**Description:** As a player, I want the UI to be consistent, with the choice modal being the primary way to end the game after visiting all positions.

**Acceptance Criteria:**
- [ ] EndGameButton is hidden once completion choice flow is active
- [ ] Player uses choice modal (triggered by correct guess) to end game
- [ ] If player skips all remaining positions without guessing, EndGameButton reappears
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Create new `CompletionChoiceModal` component that displays when trigger conditions are met
- FR-2: Trigger conditions: `hasVisitedAllPositions() === true` AND `isCorrect === true` AND `hasSkippedPositions() === true`
- FR-3: Modal must display: remaining unguessed count, "Continue Playing" button, "See Results" button
- FR-4: "Continue Playing" navigates to first position with status `skipped`
- FR-5: "See Results" calls existing `endGameAction()` to complete the game
- FR-6: Add `showCompletionChoice` boolean to game store to control modal visibility
- FR-7: Add `hasSkippedPositions()` selector to game store
- FR-8: Modify `useGameGuess` hook to check trigger conditions after correct guess
- FR-9: ResultCard auto-navigation should be paused when `showCompletionChoice` is true

## Non-Goals

- No changes to scoring algorithm or speed bonuses
- No time limits or countdowns in the choice modal
- No changes to the existing manual "End Game" button behavior (still works for non-triggered scenarios)
- No changes to practice mode or non-daily challenges
- No ability to review already-guessed positions in a special "review mode"

## Design Considerations

- Modal should match existing dark gaming theme with purple/pink accents
- Use existing `Dialog` component from shadcn/ui for consistency
- "Continue Playing" button should be primary (purple gradient)
- "See Results" button should be secondary (outline style)
- Show encouraging message like "Keep going! You have X games left to discover"
- Modal should be centered with subtle backdrop blur

## Technical Considerations

- Integrate with existing `gameStore` for state management
- Reuse `findFirstSkipped()` helper or create new selector for navigation
- Modal state should not persist to localStorage (fresh on each session)
- Ensure ResultCard countdown pauses when modal is visible
- Test edge case: player on position 10, guesses correctly, has skipped positions 3 and 7

## Success Metrics

- Players can choose to continue or end in under 2 seconds (clear UI)
- No reports of "game ended unexpectedly" after implementation
- Players who choose "Continue" can successfully navigate to and guess skipped games

## Open Questions

- Should the modal show which specific positions are skipped (e.g., "Positions 3, 7 remaining")?
- Should there be a keyboard shortcut to quickly choose (Enter for Continue, Esc for Results)?
