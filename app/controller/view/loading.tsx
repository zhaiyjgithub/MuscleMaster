import { ActivityIndicator, Text, View } from "react-native"

const Loading = () => {
    return (
        <View 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
            }}
          >
            <View className="bg-white p-4 rounded-xl items-center">
              <ActivityIndicator size="large" color="#1e88e5" />
              <Text className="text-base mt-2">Syncing device data...</Text>
            </View>
          </View>
    )
}

export default Loading