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

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) setError(loginError.message);
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

          {/* Heading */}
          <Text className="text-ink text-2xl font-bold mb-8">Sign in</Text>

          {/* Form */}
          <View className="gap-3">
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
                placeholder="••••••••"
                placeholderTextColor="#9a9a9a"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            {error ? (
              <Text className="text-error text-sm font-light">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-primary py-4 items-center mt-2"
              onPress={handleLogin}
              disabled={loading}
              style={{ borderRadius: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View className="border-t border-hairline my-8" />

          {/* Footer */}
          <View className="flex-row gap-1">
            <Text className="text-muted font-light text-sm">Don't have an account?</Text>
            <Link href="/(auth)/signup">
              <Text className="text-primary font-bold text-sm">Create account</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
