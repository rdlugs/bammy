import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router"
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

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })

  async function onSubmit(values: RegisterInput) {
    try {
      const user = await register(values)
      toast.success(`Welcome, ${user.name}!`)
      navigate("/dashboard", { replace: true })
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>Get started with Bammy</CardDescription>
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
