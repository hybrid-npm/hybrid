"use client"

import { useMiniKit } from "@coinbase/onchainkit/minikit"
import { useEffect, useState } from "react"
import {
	type InstalledSkill,
	type SkillInfo,
	addSkill,
	listSkills,
	removeSkill
} from "../lib/skills"

export default function SkillsManager() {
	const { context, isFrameReady, setFrameReady } = useMiniKit()
	const [role, setRole] = useState<"owner" | "guest" | null>(null)
	const [skills, setSkills] = useState<{
		core: SkillInfo[]
		installed: InstalledSkill[]
		registry: SkillInfo[]
	} | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [addSource, setAddSource] = useState("")
	const [adding, setAdding] = useState(false)
	const [removing, setRemoving] = useState<string | null>(null)
	const [authenticating, setAuthenticating] = useState(false)
	const [fid, setFid] = useState<string | null>(null)
	const [authToken, setAuthToken] = useState<string | null>(null)

	useEffect(() => {
		if (!isFrameReady) {
			setFrameReady()
		}
	}, [isFrameReady, setFrameReady])

	async function handleAuthenticate() {
		setAuthenticating(true)
		try {
			// Always use Farcaster Quick Auth for verified identity
			const { sdk } = await import("@farcaster/miniapp-sdk")
			const result = await sdk.quickAuth.getToken()
			if (result?.token) {
				const res = await fetch("/api/auth/verify", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token: result.token })
				})
				if (res.ok) {
					const data = await res.json()
					setFid(data.fid)
					setRole(data.role)
					setAuthToken(result.token)
				} else {
					setRole("guest")
				}
			} else {
				setRole("guest")
			}
		} catch (err) {
			console.error("Auth error:", err)
			setRole("guest")
		} finally {
			setAuthenticating(false)
		}
	}

	useEffect(() => {
		// Auto-authenticate with context if available
		if (isFrameReady && context?.user?.fid && !role) {
			handleAuthenticate()
		}
	}, [isFrameReady, context?.user?.fid, role])

	useEffect(() => {
		if (role === "owner") {
			loadSkills()
		}
	}, [role])

	async function loadSkills() {
		try {
			setLoading(true)
			const data = await listSkills()
			setSkills(data)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load skills")
		} finally {
			setLoading(false)
		}
	}

	async function handleAddSkill() {
		if (!addSource.trim() || !authToken) return

		setAdding(true)
		setError(null)

		try {
			const result = await addSkill(addSource, authToken)

			if (result.success) {
				setAddSource("")
				await loadSkills()
			} else {
				setError(result.error || "Failed to add skill")
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add skill")
		} finally {
			setAdding(false)
		}
	}

	async function handleRemoveSkill(name: string) {
		if (!authToken) return

		setRemoving(name)
		setError(null)

		try {
			const result = await removeSkill(name, authToken)

			if (result.success) {
				await loadSkills()
			} else {
				setError(result.error || "Failed to remove skill")
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove skill")
		} finally {
			setRemoving(null)
		}
	}

	if (!role && !authenticating) {
		return (
			<div style={styles.container}>
				<div style={styles.card}>
					<h1 style={styles.title}>⚙️ Skills Manager</h1>
					<p style={styles.text}>Sign in to manage your agent's skills.</p>
					<button
						type="button"
						style={styles.button}
						onClick={handleAuthenticate}
					>
						Sign In with Farcaster
					</button>
				</div>
			</div>
		)
	}

	if (loading || role === null) {
		return (
			<div style={styles.container}>
				<div style={styles.card}>
					<h1 style={styles.title}>⚙️ Skills Manager</h1>
					<p style={styles.text}>Loading...</p>
				</div>
			</div>
		)
	}

	if (role !== "owner") {
		return (
			<div style={styles.container}>
				<div style={styles.card}>
					<h1 style={styles.title}>⚙️ Skills Manager</h1>
					<p style={styles.errorText}>
						Access denied. Only owners can manage skills.
					</p>
				</div>
			</div>
		)
	}

	return (
		<div style={styles.container}>
			<div style={styles.card}>
				<h1 style={styles.title}>⚙️ Skills Manager</h1>
				<p style={styles.subtitle}>{fid ? `FID: ${fid}` : ""}</p>

				{error && <p style={styles.errorText}>{error}</p>}

				{/* Installed Skills */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>
						Installed Skills ({skills?.installed.length || 0})
					</h2>
					{skills?.installed.length === 0 ? (
						<p style={styles.emptyText}>No installed skills</p>
					) : (
						<div style={styles.skillList}>
							{skills?.installed.map((skill) => (
								<div key={skill.name} style={styles.skillCard}>
									<div style={styles.skillInfo}>
										<span style={styles.skillName}>{skill.name}</span>
										<span style={styles.skillSource}>{skill.source}</span>
									</div>
									<button
										type="button"
										style={{
											...styles.removeButton,
											...(removing === skill.name
												? styles.removeButtonDisabled
												: {})
										}}
										onClick={() => handleRemoveSkill(skill.name)}
										disabled={removing === skill.name}
									>
										{removing === skill.name ? "Removing..." : "Remove"}
									</button>
								</div>
							))}
						</div>
					)}
				</section>

				{/* Core Skills */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>
						Core Skills ({skills?.core.length || 0})
					</h2>
					<div style={styles.skillList}>
						{skills?.core.map((skill) => (
							<div key={skill.name} style={styles.skillCard}>
								<div style={styles.skillInfo}>
									<span style={styles.skillName}>{skill.name}</span>
									<span style={styles.skillDesc}>{skill.description}</span>
								</div>
								<span style={styles.coreBadge}>Core</span>
							</div>
						))}
					</div>
				</section>

				{/* Add Skill */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>Add Skill</h2>
					<div style={styles.addForm}>
						<input
							style={styles.input}
							type="text"
							placeholder="github:owner/repo or npm package"
							value={addSource}
							onChange={(e) => setAddSource(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
						/>
						<button
							type="button"
							style={{
								...styles.addButton,
								...(adding ? styles.addButtonDisabled : {})
							}}
							onClick={handleAddSkill}
							disabled={adding || !addSource.trim()}
						>
							{adding ? "Adding..." : "Add"}
						</button>
					</div>
				</section>

				{/* Available Skills */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>Available Skills</h2>
					<div style={styles.skillList}>
						{skills?.registry.map((skill) => (
							<div key={skill.name} style={styles.skillCard}>
								<div style={styles.skillInfo}>
									<span style={styles.skillName}>{skill.name}</span>
									<span style={styles.skillDesc}>{skill.description}</span>
								</div>
								<button
									type="button"
									style={styles.addButton}
									onClick={() => {
										setAddSource(skill.source)
									}}
								>
									Use
								</button>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	)
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		minHeight: "100vh",
		padding: "1rem",
		backgroundColor: "#fafafa",
		display: "flex",
		justifyContent: "center"
	},
	card: {
		maxWidth: "28rem",
		width: "100%",
		backgroundColor: "#fff",
		borderRadius: "0.5rem",
		padding: "1.5rem",
		boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
	},
	title: {
		fontSize: "1.5rem",
		fontWeight: "bold",
		marginBottom: "0.5rem"
	},
	subtitle: {
		fontSize: "0.875rem",
		color: "#6b7280",
		marginBottom: "1rem"
	},
	text: {
		color: "#374151",
		marginBottom: "1rem"
	},
	errorText: {
		color: "#dc2626",
		fontSize: "0.875rem",
		marginBottom: "1rem"
	},
	section: {
		marginBottom: "1.5rem"
	},
	sectionTitle: {
		fontSize: "1rem",
		fontWeight: "600",
		marginBottom: "0.75rem",
		color: "#374151"
	},
	skillList: {
		display: "flex",
		flexDirection: "column",
		gap: "0.5rem"
	},
	skillCard: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "0.75rem",
		backgroundColor: "#f9fafb",
		borderRadius: "0.375rem",
		border: "1px solid #e5e7eb"
	},
	skillInfo: {
		display: "flex",
		flexDirection: "column",
		gap: "0.25rem"
	},
	skillName: {
		fontWeight: "500",
		color: "#111827"
	},
	skillSource: {
		fontSize: "0.75rem",
		color: "#6b7280"
	},
	skillDesc: {
		fontSize: "0.75rem",
		color: "#6b7280"
	},
	coreBadge: {
		fontSize: "0.75rem",
		padding: "0.25rem 0.5rem",
		backgroundColor: "#dbeafe",
		color: "#1e40af",
		borderRadius: "0.25rem"
	},
	emptyText: {
		color: "#9ca3af",
		fontSize: "0.875rem"
	},
	addForm: {
		display: "flex",
		gap: "0.5rem"
	},
	input: {
		flex: 1,
		padding: "0.5rem 0.75rem",
		border: "1px solid #d1d5db",
		borderRadius: "0.375rem",
		fontSize: "0.875rem"
	},
	button: {
		padding: "0.5rem 1rem",
		backgroundColor: "#111827",
		color: "#fff",
		borderRadius: "0.375rem",
		border: "none",
		fontSize: "0.875rem",
		fontWeight: "500",
		cursor: "pointer"
	},
	addButton: {
		padding: "0.5rem 0.75rem",
		backgroundColor: "#3b82f6",
		color: "#fff",
		borderRadius: "0.375rem",
		border: "none",
		fontSize: "0.875rem",
		fontWeight: "500",
		cursor: "pointer"
	},
	addButtonDisabled: {
		opacity: 0.5,
		cursor: "not-allowed"
	},
	removeButton: {
		padding: "0.25rem 0.5rem",
		backgroundColor: "#ef4444",
		color: "#fff",
		borderRadius: "0.25rem",
		border: "none",
		fontSize: "0.75rem",
		cursor: "pointer"
	},
	removeButtonDisabled: {
		opacity: 0.5,
		cursor: "not-allowed"
	}
}
