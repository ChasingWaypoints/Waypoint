import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Google Play's prominent disclosure for background location.
 *
 * This is not a nicety. Play's Permissions Declaration for
 * ACCESS_BACKGROUND_LOCATION is rejected unless a dialog like this appears
 * BEFORE the OS runtime prompt, names "location", says "background" or "when
 * the app is closed", and lists every feature that uses it — and the demo video
 * Google requires has to show this screen on its way to the permission prompt.
 * The app went straight to the runtime prompt, which is one of the most common
 * reasons a tracking app gets bounced.
 *
 * It also has to be dismissible without consenting, so "Not now" is a real
 * choice and tracking simply does not start.
 */
export default function LocationDisclosure({
  visible, onAccept, onDecline,
}: { visible: boolean; onAccept: () => void; onDecline: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDecline}>
      <View className="flex-1 bg-black/70 justify-end">
        <View
          className="bg-surface-dark-elevated rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: insets.bottom + 24, maxHeight: "88%" }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-white text-xl font-bold leading-7 mb-4">
              Waypoint collects location data in the background
            </Text>

            <Text className="text-on-dark text-sm leading-6 mb-4">
              Waypoint collects location data to put you on your event's live map — including
              when the app is closed or not in use. Your phone keeps recording your position
              while it's in your pocket and the screen is off, which is the whole point of a
              beacon.
            </Text>

            <Text className="text-on-dark-soft text-xs uppercase font-bold tracking-wider mb-3">
              What it's used for
            </Text>
            {[
              ["Live event tracking", "Your position on the event map, visible to the organizer and anyone holding your share link."],
              ["Emergency response", "Your last known position for your emergency contacts and the organizer if something goes wrong."],
              ["Your ride history", "The track of where you rode, saved to your account."],
            ].map(([title, body]) => (
              <View key={title} className="flex-row mb-3">
                <Text className="text-primary text-sm mr-2">•</Text>
                <View className="flex-1">
                  <Text className="text-white text-sm font-semibold">{title}</Text>
                  <Text className="text-on-dark-soft text-xs leading-5 mt-0.5">{body}</Text>
                </View>
              </View>
            ))}

            <Text className="text-on-dark-soft text-xs leading-5 mt-2 mb-6">
              Location is collected only while you have a tracking session running. You can stop
              it at any time from the Track screen, and privacy zones keep chosen areas — like
              your home — off the map entirely.
            </Text>
          </ScrollView>

          <TouchableOpacity
            className="bg-primary rounded-xl py-4 items-center"
            onPress={onAccept}
          >
            <Text className="text-on-primary font-bold text-sm uppercase tracking-wide">
              Continue
            </Text>
          </TouchableOpacity>
          <TouchableOpacity className="py-4 items-center" onPress={onDecline}>
            <Text className="text-on-dark-soft font-semibold text-sm">Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
