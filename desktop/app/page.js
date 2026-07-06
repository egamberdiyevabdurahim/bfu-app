import { redirect } from "next/navigation";

// `/` is the City / Discovery surface — send the root there so the flagship
// "building tonight" screen is the front door.
export default function Home() {
  redirect("/city");
}
