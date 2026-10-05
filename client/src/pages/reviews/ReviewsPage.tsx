import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, GitPullRequest, Play } from "lucide-react"
import {
  ActiveFilterChips,
  FilterPopover,
  FilterSelect,
  FilterToolbar,
  SearchInput,
  type ActiveFilter,
} from "@/components/TableFilters"
import { PageHeader } from "@/components/PageHeader"
import { PageShell } from "@/components/PageShell"
import { TablePagination } from "@/components/TablePagination"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebounced } from "@/hooks/use-debounced"
import { usePagination } from "@/hooks/use-pagination"
import { ALL, selectedLabel } from "@/lib/filters"
import { useRepos } from "@/features/forge/api"
import { useReviews, type ReviewQuery } from "@/features/reviews/api"
import { STATUS_OPTIONS, TRIGGER_OPTIONS, VERDICT_OPTIONS } from "@/features/reviews/options"
import { ReviewStatsStrip } from "@/features/reviews/ReviewStatsStrip"
import { ManualReviewSheet } from "@/features/reviews/ManualReviewSheet"
import { ReviewsTable } from "@/features/reviews/ReviewsTable"

type View = "changes" | "runs"

const only = <T extends string>(value: string) => (value === ALL ? undefined : (value as T))

export function ReviewsPage() {
  const pagination = usePagination()
  const [view, setView] = useState<View>("changes")
  const [status, setStatus] = useState(ALL)
  const [verdict, setVerdict] = useState(ALL)
  const [trigger, setTrigger] = useState(ALL)
  const [repo, setRepo] = useState(ALL)
  const [includeSuperseded, setIncludeSuperseded] = useState(false)
  const [query, setQuery] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const q = useDebounced(query.trim())

  const repos = useRepos()
  const repoOptions = useMemo(
    () =>
      (repos.data?.repos ?? [])
        .map((r) => ({ value: r.id, label: r.fullPath }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [repos.data],
  )

  const params: ReviewQuery = {
    view,
    status: only<NonNullable<ReviewQuery["status"]>>(status),
    verdict: only<NonNullable<ReviewQuery["verdict"]>>(verdict),
    trigger: only<NonNullable<ReviewQuery["trigger"]>>(trigger),
    repoId: only(repo),
    q: q || undefined,
    includeSuperseded,
    page: pagination.page,
    limit: pagination.size,
  }
  const { data, isPending, isError } = useReviews(params)
  // A page past the end (e.g. a stale link) falls back to the last real page.
  const lastPage = data ? Math.max(1, Math.ceil(data.total / pagination.size)) : 1
  useEffect(() => {
    if (pagination.page > lastPage) pagination.setPage(lastPage)
  }, [pagination, lastPage])

  const filtering = status !== ALL || verdict !== ALL || trigger !== ALL || repo !== ALL || includeSuperseded
  const narrowed = filtering || q !== ""

  // A new filter, search or view starts over at the first page.
  function filterBy<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value)
      pagination.setPage(1)
    }
  }

  function clearFilters() {
    setStatus(ALL)
    setVerdict(ALL)
    setTrigger(ALL)
    setRepo(ALL)
    setIncludeSuperseded(false)
    pagination.setPage(1)
  }

  const activeFilters = [
    { label: "Status", value: selectedLabel(status, STATUS_OPTIONS), onRemove: () => filterBy(setStatus)(ALL) },
    { label: "Verdict", value: selectedLabel(verdict, VERDICT_OPTIONS), onRemove: () => filterBy(setVerdict)(ALL) },
    { label: "Trigger", value: selectedLabel(trigger, TRIGGER_OPTIONS), onRemove: () => filterBy(setTrigger)(ALL) },
    { label: "Repository", value: selectedLabel(repo, repoOptions), onRemove: () => filterBy(setRepo)(ALL) },
    {
      label: "Superseded",
      value: includeSuperseded ? "Shown" : null,
      onRemove: () => filterBy(setIncludeSuperseded)(false),
    },
  ].filter((filter): filter is ActiveFilter => filter.value !== null)

  return (
    <PageShell>
      <PageHeader
        title="Reviews"
        description="Every review Bammy has run on your pull and merge requests."
        actions={
          <Button onClick={() => setManualOpen(true)}>
            <Play />
            Manual review
          </Button>
        }
      />
      <ReviewStatsStrip />
      <FilterToolbar>
        <Tabs value={view} onValueChange={(value) => filterBy(setView)(value as View)} className="mr-auto">
          <TabsList>
            <TabsTrigger value="changes">By change</TabsTrigger>
            <TabsTrigger value="runs">All runs</TabsTrigger>
          </TabsList>
        </Tabs>
        <ActiveFilterChips filters={activeFilters} />
        <FilterPopover active={filtering} onClear={clearFilters}>
          <FilterSelect
            id="review-status"
            label="Status"
            allLabel="All statuses"
            value={status}
            onValueChange={filterBy(setStatus)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            id="review-verdict"
            label="Verdict"
            allLabel="All verdicts"
            value={verdict}
            onValueChange={filterBy(setVerdict)}
            options={VERDICT_OPTIONS}
          />
          <FilterSelect
            id="review-trigger"
            label="Trigger"
            allLabel="All triggers"
            value={trigger}
            onValueChange={filterBy(setTrigger)}
            options={TRIGGER_OPTIONS}
          />
          {repoOptions.length > 1 && (
            <FilterSelect
              id="review-repo"
              label="Repository"
              allLabel="All repositories"
              value={repo}
              onValueChange={filterBy(setRepo)}
              options={repoOptions}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="review-superseded" className="text-xs text-muted-foreground">
              Show superseded runs
            </Label>
            <Switch
              id="review-superseded"
              checked={includeSuperseded}
              onCheckedChange={filterBy(setIncludeSuperseded)}
            />
          </div>
        </FilterPopover>
        <SearchInput label="Search reviews" value={query} onChange={filterBy(setQuery)} />
      </FilterToolbar>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load reviews.</AlertTitle>
        </Alert>
      ) : data.total === 0 && !narrowed ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitPullRequest />
            </EmptyMedia>
            <EmptyTitle>No reviews yet</EmptyTitle>
            <EmptyDescription>Start a manual review to run the first one.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setManualOpen(true)}>
              <Play />
              Manual review
            </Button>
          </EmptyContent>
        </Empty>
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No reviews match these filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <ReviewsTable reviews={data.reviews} actions grouped={view === "changes"} />
            <TablePagination
              page={Math.min(pagination.page, lastPage)}
              size={pagination.size}
              total={data.total}
              onPageChange={pagination.setPage}
              onSizeChange={pagination.setSize}
            />
          </CardContent>
        </Card>
      )}
      <ManualReviewSheet open={manualOpen} onOpenChange={setManualOpen} />
    </PageShell>
  )
}
