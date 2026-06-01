import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    setError("");
    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 px-6 pt-16 pb-10">

          {/* Brand */}
          <View className="mb-12">
            <Text className="text-ink text-3xl font-bold tracking-tight">Waypoint</Text>
            <Text className="text-muted text-sm font-light mt-1">Track every adventure</Text>
          </View>

          <Text className="text-ink text-2xl font-bold mb-8">Create account</Text>

          {success ? (
            <View className="border border-success p-4">
              <Text className="text-body-strong font-bold mb-1">Check your email</Text>
              <Text className="text-body font-light text-sm">
                We sent you a confirmation link. Click it to activate your account.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              <View>
                <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Full Name</Text>
                <TextInput
                  className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
                  placeholder="Victor Orellana"
                  placeholderTextColor="#9a9a9a"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                />
              </View>

              <View>
                <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Email</Text>
                <TextInput
                  className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
                  placeholder="you@example.com"
                  placeholderTextColor="#9a9a9a"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>

              <View>
                <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Password</Text>
                <TextInput
                  className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#9a9a9a"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
              </View>

              {error ? (
                <Text className="text-error text-sm font-light">{error}</Text>
              ) : null}

              <TouchableOpacity
                className="bg-primary py-4 items-center mt-2"
                onPress={handleSignUp}
                disabled={loading}
                style={{ borderRadius: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View className="border-t border-hairline my-8" />

          <View className="flex-row gap-1">
            <Text className="text-muted font-light text-sm">Already have an account?</Text>
            <Link href="/(auth)/login">
              <Text className="text-primary font-bold text-sm">Sign in</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
