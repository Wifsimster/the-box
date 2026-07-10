import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
    GeoGamersGuessLocationResult,
    GeoGamersRunView,
    GeoPoint,
} from '@the-box/types'
import { geoGamersApi, GeoGamersApiError } from '../lib/api/geogamers'
import { getApiErrorMessage } from '../lib/api-errors'

// UI phase, distinct from the server-side run phase: it also models the
// loading / result / error states the page renders.
type Phase =
    | 'idle'
    | 'loading'
    | 'identify'
    | 'locate'
    | 'result'
    | 'error'

interface GeoGamersState {
    phase: Phase
    errorMessage: string | null
    run: GeoGamersRunView | null

    // identify
    guessText: string
    lastCorrect: boolean | null
    lastProximity: 'far' | 'close' | 'very_close' | null

    // locate
    selectedMapId: number | null
    pendingPin: GeoPoint | null

    // result
    result: GeoGamersGuessLocationResult | null

    // guest run token persisted so a reload resumes the same run and the
    // one-run-per-device soft cap holds; cleared on a fresh ranked start.
    guestRunToken: string | null

    // claim (guest -> account)
    claiming: boolean
    claimed: boolean

    // actions
    start: () => Promise<void>
    setGuessText: (v: string) => void
    submitGameGuess: () => Promise<void>
    selectMap: (id: number) => void
    setPendingPin: (p: GeoPoint | null) => void
    submitLocation: () => Promise<void>
    useJoker: () => Promise<void>
    claimAfterSignup: () => Promise<boolean>
    reset: () => void
}

function deriveUiPhase(run: GeoGamersRunView): Phase {
    if (run.phase === 'identify') return 'identify'
    if (run.phase === 'locate') return 'locate'
    return 'result'
}

export const useGeoGamersStore = create<GeoGamersState>()(
    persist(
        (set, get) => ({
            phase: 'idle',
            errorMessage: null,
            run: null,
            guessText: '',
            lastCorrect: null,
            lastProximity: null,
            selectedMapId: null,
            pendingPin: null,
            result: null,
            guestRunToken: null,
            claiming: false,
            claimed: false,

            async start() {
                set({ phase: 'loading', errorMessage: null, result: null })
                try {
                    // Resume a persisted guest run when possible; otherwise start fresh.
                    const token = get().guestRunToken
                    let run: GeoGamersRunView
                    if (token) {
                        try {
                            run = await geoGamersApi.getRun(token)
                        } catch {
                            run = await geoGamersApi.startRun()
                        }
                    } else {
                        run = await geoGamersApi.startRun()
                    }
                    set({
                        run,
                        guestRunToken: run.runToken,
                        phase: deriveUiPhase(run),
                        selectedMapId: run.maps?.[0]?.id ?? null,
                    })
                } catch (err) {
                    set({ phase: 'error', errorMessage: getApiErrorMessage(err) })
                }
            },

            setGuessText(v) {
                set({ guessText: v })
            },

            async submitGameGuess() {
                const { run, guessText } = get()
                if (!run || !guessText.trim()) return
                try {
                    const res = await geoGamersApi.guessGame({
                        runToken: run.runToken,
                        guess: guessText.trim(),
                    })
                    set({
                        run: res.run,
                        lastCorrect: res.correct,
                        lastProximity: res.proximity ?? null,
                        guessText: res.correct ? '' : '',
                        phase: deriveUiPhase(res.run),
                        selectedMapId: res.run.maps?.[0]?.id ?? get().selectedMapId,
                    })
                } catch (err) {
                    set({ errorMessage: getApiErrorMessage(err) })
                }
            },

            selectMap(id) {
                set({ selectedMapId: id })
            },

            setPendingPin(p) {
                set({ pendingPin: p })
            },

            async submitLocation() {
                const { run, selectedMapId, pendingPin } = get()
                if (!run || !selectedMapId || !pendingPin) return
                try {
                    const result = await geoGamersApi.guessLocation({
                        runToken: run.runToken,
                        geoMapId: selectedMapId,
                        guess: pendingPin,
                    })
                    // Refresh the run view so phase flips to done.
                    const refreshed = await geoGamersApi.getRun(run.runToken)
                    set({ result, run: refreshed, phase: 'result' })
                } catch (err) {
                    set({ errorMessage: getApiErrorMessage(err) })
                }
            },

            async useJoker() {
                const { run } = get()
                if (!run) return
                try {
                    const refreshed = await geoGamersApi.useJoker(run.runToken)
                    set({
                        run: refreshed,
                        phase: deriveUiPhase(refreshed),
                        guessText: '',
                        lastProximity: null,
                        lastCorrect: null,
                    })
                } catch (err) {
                    set({ errorMessage: getApiErrorMessage(err) })
                }
            },

            // Called after a successful signup while a completed guest run is in
            // memory. Silent on failure — an expired/ineligible claim is expected.
            async claimAfterSignup() {
                const { run } = get()
                if (!run) return false
                set({ claiming: true })
                try {
                    await geoGamersApi.claimRun(run.runToken)
                    set({ claiming: false, claimed: true })
                    return true
                } catch (err) {
                    if (err instanceof GeoGamersApiError) {
                        set({ claiming: false })
                        return false
                    }
                    set({ claiming: false })
                    return false
                }
            },

            reset() {
                set({
                    phase: 'idle',
                    errorMessage: null,
                    run: null,
                    guessText: '',
                    lastCorrect: null,
                    lastProximity: null,
                    selectedMapId: null,
                    pendingPin: null,
                    result: null,
                    claiming: false,
                    claimed: false,
                })
            },
        }),
        {
            name: 'geogamers-run',
            // Persist ONLY the guest run token (the soft one-run-per-device
            // handle). Run state itself is always re-fetched from the server.
            partialize: (s) => ({ guestRunToken: s.guestRunToken }),
        },
    ),
)
