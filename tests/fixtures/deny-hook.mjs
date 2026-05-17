export default async function hook() {
  return {
    action: "deny",
    reason: "blocked by hook",
  };
}
