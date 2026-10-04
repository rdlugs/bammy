import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "react-router"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { useConnectGitlab, useConnections, useDeleteConnection, type Connection } from "@/features/forge/api"

const gitlabSchema = z.object({
  host: z.string().trim(),
  token: z.string().trim().min(1, "Token is required"),
})
type GitlabInput = z.infer<typeof gitlabSchema>

const RETURN_MESSAGES: Record<string, string> = {
  github_install_failed: "GitHub installation could not be completed",
  github_install_forbidden: "That GitHub installation is not one your account can access",
  github_pending_approval: "The installation is waiting for an organization owner to approve it",
}

// GitHub sends the browser back here with ?connected= or ?error=.
function useReturnToast() {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const connected = params.get("connected")
    const error = params.get("error")
    if (!connected && !error) return
    if (connected) toast.success("GitHub connected")
    if (error) toast.error(RETURN_MESSAGES[error] ?? "Connection failed")
    setParams({}, { replace: true })
  }, [params, setParams])
}

function GitlabForm() {
  const connect = useConnectGitlab()
  const form = useForm<GitlabInput>({
    resolver: zodResolver(gitlabSchema),
    defaultValues: { host: "gitlab.com", token: "" },
  })

  async function onSubmit(values: GitlabInput) {
    try {
      const { connection } = await connect.mutateAsync(values)
      toast.success(`Connected GitLab as ${connection.accountLogin}`)
      form.reset({ host: values.host, token: "" })
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField control={form.control} name="host" label="Host" placeholder="gitlab.com" />
        <TextField
          control={form.control}
          name="token"
          label="Access token"
          type="password"
          autoComplete="off"
          placeholder="glpat-..."
        />
        <Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Connect GitLab
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

function RemoveButton({ connection }: { connection: Connection }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteConnection()

  async function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      await remove.mutateAsync(connection.id)
      toast.success("Connection removed")
    } catch {
      toast.error("Could not remove the connection")
      setConfirming(false)
    }
  }

  return (
    <Button
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      onClick={onClick}
      onBlur={() => setConfirming(false)}
      disabled={remove.isPending}
    >
      {confirming ? "Confirm remove" : "Remove"}
    </Button>
  )
}

export function ConnectionsPage() {
  useReturnToast()
  const { data, isPending } = useConnections()

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>Install the Bammy GitHub App on the accounts and repositories to review.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.githubAvailable === false ? (
              <p className="text-sm text-muted-foreground">GitHub is not configured on this server.</p>
            ) : (
              <Button asChild disabled={!data}>
                <a href="/api/connections/github/install">Install GitHub App</a>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>GitLab</CardTitle>
            <CardDescription>
              A personal, project or group token with the <code>api</code> scope and at least Developer access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GitlabForm />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? null : !data?.connections.length ? (
            <p className="text-sm text-muted-foreground">Nothing connected yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Forge</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell className="font-medium">{connection.accountLogin}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{connection.provider === "github" ? "GitHub App" : "GitLab token"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{connection.host}</TableCell>
                    <TableCell className="text-right">
                      <RemoveButton connection={connection} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
