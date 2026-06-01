import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
      className="flex-1 bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo */}
        <View className="items-center mb-10">
          <Text className="text-5xl mb-3">🗺️</Text>
          <Text className="text-white text-3xl font-bold tracking-tight">Create account</Text>
          <Text className="text-slate-400 text-sm mt-1">Start tracking your adventures</Text>
        </View>

        {/* Success state */}
        {success ? (
          <View className="bg-emerald-500/20 rounded-xl p-4 items-center">
            <Text className="text-emerald-400 font-bold text-base mb-1">Check your email!</Text>
            <Text className="text-emerald-300 text-sm text-center">
              We sent you a confirmation link. Click it to activate your account.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            <TextInput
              className="bg-slate-800 text-white rounded-xl px-4 py-4 text-base"
              placeholder="Full name"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <TextInput
              className="bg-slate-800 text-white rounded-xl px-4 py-4 text-base"
              placeholder="Email"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              className="bg-slate-800 text-white rounded-xl px-4 py-4 text-base"
              placeholder="Password (min 6 characters)"
              placeholderTextColor="#64748b"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            {error ? (
              <Text className="text-red-400 text-sm px-1">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-emerald-500 rounded-xl py-4 items-center mt-2"
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View className="flex-row justify-center mt-6 gap-1">
          <Text className="text-slate-400">Already have an account?</Text>
          <Link href="/(auth)/login">
            <Text className="text-emerald-400 font-semibold">Sign in</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
