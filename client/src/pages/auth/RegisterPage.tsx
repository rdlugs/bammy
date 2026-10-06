import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field"
import { AuthLayout } from "@/layouts/AuthLayout"
import { useAuth } from "@/features/auth/useAuth"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { registerSchema, type RegisterInput } from "@/features/auth/schemas"
import { useRegistration } from "@/features/auth/registration"

function RegistrationUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldDescription className="text-center">
            Already have an account? <Link to="/login">Log in</Link>
          </FieldDescription>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  // Set by the invite page; the server checks it, this page only passes it on.
  const inviteToken = useSearchParams()[0].get("invite") ?? undefined
  // The form stays usable while this loads or if it fails: the server enforces
  // the mode either way, this only explains it up front.
  const { data: registration } = useRegistration()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", inviteToken },
  })

  async function onSubmit(values: RegisterInput) {
    try {
      const user = await register(values)
      toast.success(`Welcome, ${user.name}!`)
      navigate("/home", { replace: true })
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  if (registration && !registration.firstUser) {
    if (registration.mode === "closed") {
      return (
        <RegistrationUnavailable
          title="Registration is closed"
          description="This Bammy instance is not accepting new accounts. Ask an admin for access."
        />
      )
    }
    if (registration.mode === "invite" && !inviteToken) {
      return (
        <RegistrationUnavailable
          title="Invite required"
          description="Accounts on this Bammy instance are created from invite links. Ask an admin to invite you."
        />
      )
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>
            {registration?.firstUser ? "You are the first user, so you will be this instance's admin" : "Get started with Bammy"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <TextField
                control={form.control}
                name="name"
                label="Name"
                autoComplete="name"
                placeholder="Jane Doe"
              />
              <TextField
                control={form.control}
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
              <TextField
                control={form.control}
                name="password"
                label="Password"
                type="password"
                autoComplete="new-password"
              />
              <TextField
                control={form.control}
                name="confirmPassword"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
              />
              <Field>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Create account
                </Button>
                <FieldDescription className="text-center">
                  Already have an account? <Link to="/login">Log in</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
